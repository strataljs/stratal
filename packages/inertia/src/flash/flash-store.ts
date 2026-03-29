import type { RouterContext } from 'stratal/router'

export interface FlashStore {
  read(ctx: RouterContext): Promise<Record<string, unknown>>
  write(ctx: RouterContext, data: Record<string, unknown>): Promise<void>
  clear(ctx: RouterContext): Promise<void>
}
