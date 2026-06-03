import type { Context } from 'hono'
import type { WSContext, WSReadyState } from 'hono/ws'
import type { ContextQueryResult } from '../router/router-context'
import { RouterContext } from '../router/router-context'
import type { RouterEnv } from '../router/types'
import { WebSocketError } from './websocket.error'

/**
 * WebSocket gateway context
 *
 * Extends RouterContext with WebSocket-specific methods.
 * Inherits `getContainer()`, `param()`, `query()`, `header()`, `getLocale()`
 * from RouterContext. HTTP response methods (`json()`, `redirect()`, etc.) are
 * inherited but harmless post-upgrade.
 *
 * @example
 * ```typescript
 * @OnMessage()
 * handleMessage(evt: MessageEvent, ctx: GatewayContext) {
 *   ctx.send('ack')           // convenience method
 *   ctx.header('Authorization') // upgrade request headers
 * }
 * ```
 */
export class GatewayContext extends RouterContext {
  constructor(c: Context<RouterEnv>, public readonly ws: WSContext) {
    super(c)
  }

  /** Send data through the WebSocket connection */
  send(data: string | ArrayBuffer | Uint8Array<ArrayBuffer>): void {
    this.ws.send(data)
  }

  /** Close the WebSocket connection */
  close(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }

  /** Current WebSocket ready state */
  get readyState(): WSReadyState {
    return this.ws.readyState
  }

  /**
   * Get route parameter value(s) from the raw request — WebSocket gateways are
   * not OpenAPI-registered, so reads come straight from Hono's matcher.
   *
   * - With a key → single string value.
   * - With no args → full `Record<string, string>` (or `{}` when none).
   *
   * @param key - Parameter name (e.g., 'id' for /ws/chat/:id)
   */
  override param(): Record<string, string>
  override param(key: string): string
  override param(key?: string): string | Record<string, string> {
    if (key === undefined) return this.c.req.param() ?? {}
    return this.c.req.param(key)!
  }

  /**
   * Get query parameter value from the raw request (no OpenAPI validation)
   *
   * @param key - Query parameter name
   */
  override query<R extends Record<string, unknown> | undefined = undefined, K extends string | undefined = undefined>(key?: K): ContextQueryResult<R, K> {
    if (key) {
      return this.c.req.query(key) as ContextQueryResult<R, K>
    }
    return this.c.req.query() as ContextQueryResult<R, K>
  }

  /**
   * Request body is not available in WebSocket gateways
   *
   * @throws WebSocketError always — WebSocket upgrade requests do not have a body
   */
  override body<T>(): Promise<T> {
    throw new WebSocketError('Request body is not available in WebSocket gateways')
  }
}
