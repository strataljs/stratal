import { InvalidSignatureError } from '../errors'
import { RouterError } from '../router.error'
import type { Middleware, Next } from '../middleware.interface'
import type { RouterContext } from '../router-context'
import { verifySignedUrl } from '../signed-url'

/**
 * Middleware that verifies signed URLs.
 *
 * Checks the `signature` (and optionally `expires`) query params against the
 * request URL using HMAC-SHA256 via `crypto.subtle.verify()`.
 *
 * Requires `APP_SECRET` in the Cloudflare Workers environment bindings.
 *
 * @throws InvalidSignatureError (403) if signature is missing, invalid, or expired
 *
 * @example
 * ```typescript
 * @Module({ controllers: [UnsubscribeController], providers: [VerifySignatureMiddleware] })
 * export class EmailModule implements RouteConfigurable {
 *   configureRoutes(router: Router): void {
 *     router.middleware(VerifySignatureMiddleware)
 *   }
 * }
 * ```
 */
export class VerifySignatureMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: Next): Promise<void> {
    const url = ctx.c.req.url
    const env = ctx.c.env
    const secret = (env as unknown as Record<string, string>).APP_SECRET

    if (!secret) {
      throw new RouterError('Missing required environment variable "APP_SECRET"')
    }

    const isValid = await verifySignedUrl(url, secret)
    if (!isValid) {
      throw new InvalidSignatureError()
    }

    await next()
  }
}
