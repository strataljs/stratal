import { inject } from 'tsyringe'
import { Controller } from '../../router/decorators/controller.decorator'
import { Delete, Get, Put } from '../../router/decorators/http-method.decorator'
import { type RouterContext } from '../../router/router-context'
import { FileNotFoundError } from '../errors'
import { STORAGE_TOKENS } from '../storage.tokens'
import type { StorageManagerService } from '../services/storage-manager.service'

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
    @inject(STORAGE_TOKENS.StorageManager)
    private readonly storageManager: StorageManagerService
  ) {}

  @Get('/:disk/*', { hideFromDocs: true })
  async download(ctx: RouterContext): Promise<Response> {
    const disk = ctx.param('disk')
    const path = extractWildcardPath(ctx)
    const provider = await this.storageManager.getProvider(disk)
    const result = await provider.download(path)

    const stream = result.toStream()
    if (!stream) {
      throw new FileNotFoundError(path)
    }

    return new Response(stream, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.size),
        'Content-Disposition': 'inline',
      },
    })
  }

  @Put('/:disk/*', { hideFromDocs: true })
  async upload(ctx: RouterContext): Promise<Response> {
    const disk = ctx.param('disk')
    const path = extractWildcardPath(ctx)
    const provider = await this.storageManager.getProvider(disk)

    const body = ctx.c.req.raw.body
    const contentType = ctx.header('content-type') ?? 'application/octet-stream'
    const contentLength = ctx.header('content-length')

    await provider.upload(body, path, {
      mimeType: contentType,
      size: contentLength ? parseInt(contentLength, 10) : 0,
    })

    return ctx.json({ path, disk }, 200)
  }

  @Delete('/:disk/*', { hideFromDocs: true })
  async destroy(ctx: RouterContext): Promise<Response> {
    const disk = ctx.param('disk')
    const path = extractWildcardPath(ctx)
    const provider = await this.storageManager.getProvider(disk)

    await provider.delete(path)

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
  return parts.slice(3).join('/')
}
