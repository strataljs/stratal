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
      const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
      return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  async write(ctx: RouterContext, data: Record<string, unknown>): Promise<void> {
    // UTF-8-safe base64: `btoa` alone throws on any character outside Latin1
    // (em-dashes, smart quotes, non-Latin scripts) — flash messages are
    // user-facing copy, so those are routine.
    const bytes = new TextEncoder().encode(JSON.stringify(data))
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const encoded = btoa(binary)
    await setSignedCookie(ctx.c, this.cookieName, encoded, this.secret, this.cookieOptions)
  }

  clear(ctx: RouterContext): Promise<void> {
    deleteCookie(ctx.c, this.cookieName, { path: this.cookieOptions.path })
    return Promise.resolve()
  }
}
