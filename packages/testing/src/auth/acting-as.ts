import type { AuthService } from '@stratal/framework/auth'
import { type GenericEndpointContext } from 'better-auth'
import { setSessionCookie } from 'better-auth/cookies'
import { convertSetCookieToCookie } from 'better-auth/test'

async function makeSignature(value: string, secret: string): Promise<string> {
  const algorithm = { name: 'HMAC', hash: 'SHA-256' }
  const secretBuf = new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey('raw', secretBuf, algorithm, false, ['sign'])
  const signature = await crypto.subtle.sign(algorithm.name, key, new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

function buildCookieString(name: string, value: string, options: Record<string, unknown> = {}): string {
  const encodedValue = encodeURIComponent(value)
  let str = `${name}=${encodedValue}`
  if (options.path) str += `; Path=${options.path as string}`
  if (options.httpOnly) str += '; HttpOnly'
  if (options.secure) str += '; Secure'
  if (options.sameSite) str += `; SameSite=${options.sameSite as string}`
  if (options.maxAge !== undefined) str += `; Max-Age=${Math.floor(options.maxAge as number)}`
  return str
}

/**
 * ActingAs
 *
 * Creates authentication sessions for testing.
 * Uses Better Auth's internalAdapter to create real database sessions.
 *
 * @example
 * ```typescript
 * const actingAs = new ActingAs(authService)
 * const headers = await actingAs.createSessionForUser({ id: 'user-123' })
 * ```
 */
export class ActingAs {
  constructor(private readonly authService: AuthService) { }

  async createSessionForUser(user: { id: string }): Promise<Headers> {
    const auth = this.authService.auth
    const ctx = await auth.$context

    const secret = ctx.secret

    const session = await ctx.internalAdapter.createSession(
      user.id,
      undefined,
      { ipAddress: '127.0.0.1', userAgent: 'test-client' }
    )

    const dbUser = await ctx.internalAdapter.findUserById(user.id)
    if (!dbUser) {
      throw new Error(`User not found: ${user.id}`)
    }

    const responseHeaders = new Headers()
    const mockCtx = {
      context: ctx,
      getSignedCookie: () => null,
      setSignedCookie: async (name: string, value: string, _secret: string, options: Record<string, unknown> = {}) => {
        const signature = await makeSignature(value, secret)
        const signedValue = `${value}.${signature}`
        responseHeaders.append('Set-Cookie', buildCookieString(name, signedValue, options))
      },
      setCookie: (name: string, value: string, options: Record<string, unknown> = {}) => {
        responseHeaders.append('Set-Cookie', buildCookieString(name, value, options))
      },
    }

    await setSessionCookie(mockCtx as unknown as GenericEndpointContext, { session, user: dbUser }, false)
    return convertSetCookieToCookie(responseHeaders)
  }
}
