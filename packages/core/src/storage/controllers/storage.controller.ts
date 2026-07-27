import { object, string } from 'zod/mini'
import { inject } from '../../di'
import { Controller } from '../../router/decorators/controller.decorator'
import { Delete, Get, Put } from '../../router/decorators/http-method.decorator'
import { type RouterContext } from '../../router/router-context'
import { FileNotFoundError } from '../errors/file-not-found.error'
import type { StorageService } from '../services/storage.service'
import { STORAGE_TOKENS } from '../storage.tokens'

const diskParam = object({
  disk: string(),
})

/**
 * Content types rendered inline by {@link StorageController.download}.
 *
 * Stored objects are served from the same origin as the application, so any response the browser
 * treats as a document runs in that origin's security context. Echoing an object's stored content
 * type back with `Content-Disposition: inline` therefore turns a bucket into a script-injection
 * vector: an object stored as `text/html` — or `image/svg+xml`, which is scriptable and is
 * deliberately absent below — executes against whatever session fetched it.
 *
 * The allowlist is deliberately the safe set rather than a blocklist of dangerous types, so a
 * format nobody anticipated downloads instead of rendering.
 */
const DEFAULT_INLINE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/**
 * Strips characters that cannot legally appear in the quoted `filename="…"` parameter.
 *
 * Beyond the quote and backslash that would break out of the quoting, RFC 7230 §3.2 limits a header
 * field value to visible ASCII, space, horizontal tab and obs-text — so every C0 control and DEL is
 * removed too, not just CR and LF. A key holding one of those would otherwise emit a malformed
 * header that a strict parser or intermediary may reject or interpret differently. Bytes 0x80–0xFF
 * are obs-text and stay, so non-ASCII filenames survive intact.
 */
function contentDispositionFilename(path: string): string {
  const base = path.split('/').pop() ?? 'download'
  // eslint-disable-next-line no-control-regex -- the control range is the point: these bytes are illegal in a header value.
  return base.replace(/["\\\x00-\x1f\x7f]/g, '') || 'download'
}

/**
 * Storage Controller
 *
 * Auto-registered controller that proxies R2 operations behind signed URLs.
 * Signature verification is applied via VerifySignatureMiddleware on the module's
 * configureRoutes() method.
 *
 * Routes:
 * - GET    /storage/:disk/*  → download file
 * - PUT    /storage/:disk/*  → upload file
 * - DELETE /storage/:disk/*  → delete file
 */
@Controller('/storage', { hideFromDocs: true })
export class StorageController {
  constructor(
    @inject(STORAGE_TOKENS.StorageService)
    private readonly storage: StorageService
  ) {}

  @Get('/:disk/*', { hideFromDocs: true, params: diskParam })
  async download(ctx: RouterContext): Promise<Response> {
    const disk = ctx.param('disk')
    const path = extractWildcardPath(ctx)
    const result = await this.storage.download(path, disk)

    const stream = result.toStream()
    if (!stream) {
      throw new FileNotFoundError(path)
    }

    const renderInline = DEFAULT_INLINE_CONTENT_TYPES.has(
      result.contentType.split(';')[0].trim().toLowerCase()
    )

    return new Response(stream, {
      headers: {
        // A type outside the allowlist is handed back as an opaque blob, so the browser has no
        // reason to parse it as markup even when the stored content type claims otherwise.
        'Content-Type': renderInline ? result.contentType : 'application/octet-stream',
        'Content-Length': String(result.size),
        'Content-Disposition': renderInline
          ? 'inline'
          : `attachment; filename="${contentDispositionFilename(path)}"`,
        // Prevents the browser sniffing past the content type above and rendering a disguised
        // payload anyway.
        'X-Content-Type-Options': 'nosniff',
        // Defence in depth for the inline case: a viewer or decoder handling a malformed file gets
        // an opaque origin with no scripting, so it cannot reach the session it was served to.
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    })
  }

  @Put('/:disk/*', { hideFromDocs: true, params: diskParam })
  async upload(ctx: RouterContext): Promise<Response> {
    const disk = ctx.param('disk')
    const path = extractWildcardPath(ctx)

    const body = ctx.c.req.raw.body
    const contentType = ctx.header('content-type') ?? 'application/octet-stream'
    const contentLength = ctx.header('content-length')

    await this.storage.upload(body, path, {
      mimeType: contentType,
      size: contentLength ? parseInt(contentLength, 10) : 0,
    }, disk)

    return ctx.json({ path, disk }, 200)
  }

  @Delete('/:disk/*', { hideFromDocs: true, params: diskParam })
  async destroy(ctx: RouterContext): Promise<Response> {
    const disk = ctx.param('disk')
    const path = extractWildcardPath(ctx)

    await this.storage.delete(path, disk)

    return ctx.c.body(null, 204)
  }
}

/**
 * Extract the wildcard path from the Hono context.
 * Hono stores wildcard params under the key matching the path pattern.
 */
function extractWildcardPath(ctx: RouterContext): string {
  // Hono exposes wildcard capture as the raw path after the matched prefix
  const url = new URL(ctx.c.req.url)
  const fullPath = url.pathname
  // Remove /storage/:disk/ prefix to get the file path
  const parts = fullPath.split('/')
  // ['', 'storage', 'disk', ...rest]
  const encoded = parts.slice(3).join('/')

  // `url.pathname` is percent-encoded, but object keys are stored raw — so a key holding a space,
  // a non-ASCII character, `#` or `?` would be looked up as `%20`/`%C3%A9`/… and miss. Keys are
  // opaque strings that may themselves contain `/`, so the remainder is decoded whole rather than
  // per segment. A malformed escape cannot be decoded and is left as-is; the lookup then fails as
  // a normal missing object instead of throwing a URIError out of the handler.
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}
