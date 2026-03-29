import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import type { CookieOptions } from 'hono/utils/cookie'
import type { RouterContext } from 'stratal/router'
import type { FlashStore } from './flash-store'

export interface CookieFlashStoreOptions {
  secret: string | BufferSource
  cookie?: string
  cookieOptions?: CookieOptions
}

export class CookieFlashStore implements FlashStore {
  private readonly cookieName: string
  private readonly secret: string | BufferSource
  private readonly cookieOptions: CookieOptions

  constructor(options: CookieFlashStoreOptions) {
    this.secret = options.secret
    this.cookieName = options.cookie ?? 'stratal_flash'
    this.cookieOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      ...options.cookieOptions,
    }
  }

  async read(ctx: RouterContext): Promise<Record<string, unknown>> {
    const value = await getSignedCookie(ctx.c, this.secret, this.cookieName)
    if (!value) return {}

    try {
      return JSON.parse(atob(value)) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  async write(ctx: RouterContext, data: Record<string, unknown>): Promise<void> {
    const encoded = btoa(JSON.stringify(data))
    await setSignedCookie(ctx.c, this.cookieName, encoded, this.secret, this.cookieOptions)
  }

  clear(ctx: RouterContext): Promise<void> {
    deleteCookie(ctx.c, this.cookieName, { path: this.cookieOptions.path })
    return Promise.resolve()
  }
}
