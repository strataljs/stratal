import { parseSetCookieHeader } from 'better-auth/cookies'
import { DI_TOKENS, inject, Transient } from 'stratal/di'
import { LOGGER_TOKENS, type LoggerService } from 'stratal/logger'
import type { Middleware, Next, RouterContext } from 'stratal/router'
import { type AuthContext } from '../../context/auth-context'
import { AUTH_SERVICE } from '../auth.tokens'
import type { AuthService } from '../services/auth.service'

/** Every cookie name a `Set-Cookie` value assigns, read with Better Auth's own parser. */
function namesIn(setCookie: string): string[] {
  return [...parseSetCookieHeader(setCookie).keys()]
}

/**
 * Session Verification Middleware
 *
 * Verifies user session via Better Auth and populates AuthContext with
 * the authenticated user.
 *
 * **Responsibilities:**
 * - Calls Better Auth's getSession() API
 * - Populates AuthContext with the user record if the session is valid
 * - Carries any cookie that read issued through to the response
 * - Continues request chain regardless of session status
 */
@Transient()
export class SessionVerificationMiddleware implements Middleware {
  constructor(
    @inject(AUTH_SERVICE)
    private readonly authService: AuthService,
    @inject(LOGGER_TOKENS.LoggerService) private logger: LoggerService
  ) { }

  async handle(ctx: RouterContext, next: Next): Promise<Response | void> {
    /**
     * The cookies Better Auth wrote while reading the session.
     *
     * Reading one is not always free of side effects: under `session.cookieCache`
     * it mints the cached-session cookie, and once past `session.updateAge` it
     * reissues the session cookie against the extended expiry. Both are `Set-Cookie`
     * on a response Better Auth builds internally, which is discarded unless asked
     * for — so left unforwarded, the cache is written on every request and read on
     * none, and a sliding expiry never reaches the browser at all.
     */
    let issued: string[] = []

    try {
      const { headers, response } = await this.authService.auth.api.getSession({
        headers: ctx.c.req.raw.headers,
        returnHeaders: true,
      })

      if (response) {
        const authContext = ctx.getContainer().resolve<AuthContext>(DI_TOKENS.AuthContext)
        authContext.setAuthContext({
          user: response.user,
        })
      }

      // Last, and after the user is established: this shares a `catch` with the session
      // read, so anything thrown while collecting cookies would otherwise cost the request
      // its user and turn a cookie problem into an unauthenticated one, logged at debug.
      // `getSetCookie` is the reachable candidate — it postdates the rest of `Headers`.
      issued = headers.getSetCookie()
    } catch (error: unknown) {
      this.logger.debug('Session validation failed (e.g., invalidated in DB)', { error })
    }

    await next()

    if (issued.length === 0) return

    // `c.header()` rebuilds the response as `new Response(c.res.body, c.res)`, and that
    // constructor rejects any status outside 200-599 — a 101 upgrade, or the 0 of
    // `Response.error()`, would throw here rather than pass through untouched.
    const status = ctx.c.res?.status
    if (typeof status !== 'number' || status < 200 || status > 599) return

    /**
     * A name the handler has already spoken for, which this must not overwrite.
     *
     * Sign-out is the case that makes this load-bearing rather than tidy. The session
     * is still valid when it is read, so a cached-session cookie can be minted on the
     * way in; the handler then clears that same cookie on the way out. Appending
     * afterwards would put it back — a signed-out browser holding a cached session,
     * which is the one thing the cache must never survive.
     */
    const spokenFor = new Set(ctx.c.res.headers.getSetCookie().flatMap(namesIn))

    // Appended rather than set, and one header per value: `Set-Cookie` does not fold
    // into a comma-separated list the way other repeated headers do.
    for (const cookie of issued) {
      if (namesIn(cookie).some((name) => spokenFor.has(name))) continue
      ctx.c.header('set-cookie', cookie, { append: true })
    }
  }
}
