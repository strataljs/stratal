import type { RouterContext } from 'stratal/router'
import type { LoggerService } from 'stratal/logger'
import { describe, expect, it, vi } from 'vitest'
import type { AuthService } from '../services/auth.service'
import { SessionVerificationMiddleware } from '../middleware/session-verification.middleware'

/**
 * An `AuthService` whose session read issues `issues` as `Set-Cookie`.
 *
 * Widened once, at the boundary: `auth` is Better Auth's whole inferred instance, whose
 * `api` carries every route the configured plugins contribute. The part the middleware
 * programs to is one call, and that is what this stands in for.
 */
function authServiceIssuing(issues: string[]): AuthService {
  const headers = new Headers()
  for (const cookie of issues) headers.append('set-cookie', cookie)

  return {
    auth: { api: { getSession: () => Promise.resolve({ headers, response: null }) } },
  } as unknown as AuthService
}

/**
 * An `AuthService` that verifies a user but whose headers cannot list their cookies.
 *
 * `getSetCookie` postdates the rest of `Headers`, so it is the reachable way for the
 * cookie half of this middleware to throw on a runtime that verifies sessions perfectly well.
 */
function authServiceWithoutGetSetCookie(): AuthService {
  return {
    auth: {
      api: {
        getSession: () =>
          Promise.resolve({
            headers: {
              getSetCookie: () => {
                throw new TypeError('headers.getSetCookie is not a function')
              },
            },
            response: { user: { id: 'u-1' } },
          }),
      },
    },
  } as unknown as AuthService
}

const logger = { debug: vi.fn() } as unknown as LoggerService

/** A context whose response already carries `alreadySet`, as a handler's would. */
function contextWith(alreadySet: string[]) {
  const res = new Response(null, { status: 200 })
  for (const cookie of alreadySet) res.headers.append('set-cookie', cookie)

  const setAuthContext = vi.fn()
  const ctx = {
    c: {
      req: { raw: new Request('https://example.test/parent') },
      res,
      // Hono's own contract: `set` replaces, `append` adds a second header.
      header: (name: string, value: string, options?: { append?: boolean }) => {
        if (options?.append) res.headers.append(name, value)
        else res.headers.set(name, value)
      },
    },
    getContainer: () => ({ resolve: () => ({ setAuthContext }) }),
  }

  return { ctx: ctx as unknown as RouterContext, res, setAuthContext }
}

describe('SessionVerificationMiddleware', () => {
  it('carries a cookie the session read issued through to the response', async () => {
    const middleware = new SessionVerificationMiddleware(
      authServiceIssuing(['session_data=cached; Path=/; HttpOnly']),
      logger
    )
    const { ctx, res } = contextWith([])

    await middleware.handle(ctx, () => Promise.resolve())

    expect(res.headers.getSetCookie()).toEqual(['session_data=cached; Path=/; HttpOnly'])
  })

  it('leaves a cookie the handler wrote alone, so signing out is not undone', async () => {
    // The session is still valid when it is read, so a cached-session cookie is minted on
    // the way in and the sign-out handler clears that same name on the way out. Appending
    // regardless would hand the browser back the session it just gave up.
    const middleware = new SessionVerificationMiddleware(
      authServiceIssuing(['session_data=cached; Path=/; HttpOnly']),
      logger
    )
    const { ctx, res } = contextWith(['session_data=; Path=/; Max-Age=0'])

    await middleware.handle(ctx, () => Promise.resolve())

    expect(res.headers.getSetCookie()).toEqual(['session_data=; Path=/; Max-Age=0'])
  })

  it('still establishes the user when the cookies cannot be read', async () => {
    // The cookie half shares a `catch` with the session read, and that `catch` only logs at
    // debug. Collecting cookies before the user is set would turn any failure there into a
    // request that is silently anonymous.
    const middleware = new SessionVerificationMiddleware(authServiceWithoutGetSetCookie(), logger)
    const { ctx, setAuthContext } = contextWith([])

    await middleware.handle(ctx, () => Promise.resolve())

    expect(setAuthContext).toHaveBeenCalledWith({ user: { id: 'u-1' } })
  })
})
