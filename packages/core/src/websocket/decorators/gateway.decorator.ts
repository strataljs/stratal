import { defineMetadata, getMetadata } from '../../di/metadata'
import { ROUTE_METADATA_KEYS } from '../../router/constants'
import { Controller } from '../../router/decorators/controller.decorator'
import { type Constructor } from '../../types'
import type { GatewayOptions } from '../../websocket/types'

const GATEWAY_MARKER_KEY = ROUTE_METADATA_KEYS.GATEWAY_MARKER

/**
 * Gateway decorator for WebSocket route registration
 *
 * Marks a class as a WebSocket gateway and stores route metadata.
 * Reuses the same metadata key as @Controller for middleware compatibility —
 * `getControllerRoute()`, `forRoutes()`, and the entire middleware system work
 * with zero changes.
 *
 * @param route - WebSocket route path (e.g., '/ws/chat')
 *
 * @example
 * ```typescript
 * import { type GatewayContext, Gateway, OnMessage, OnClose } from 'stratal/websocket'
 *
 * @Gateway('/ws/chat')
 * class ChatGateway {
 *   @OnMessage()
 *   handleMessage(evt: MessageEvent, ctx: GatewayContext) {
 *     ctx.send('ack')
 *   }
 *
 *   @OnClose()
 *   handleClose(evt: CloseEvent, ctx: GatewayContext) {
 *     console.log('closed')
 *   }
 * }
 * ```
 */
export function Gateway(route: string, options?: GatewayOptions) {
  return function <T extends Constructor>(target: T) {
    Controller(route, options)(target)
    defineMetadata(GATEWAY_MARKER_KEY, true, target)
    return target
  }
}

/**
 * Check if a class is a WebSocket gateway
 *
 * @param target - Class constructor or instance
 * @returns true if the class is decorated with @Gateway
 */
export function isGateway(target: object): boolean {
  const metadataTarget = typeof target === 'function' ? target : (target as { constructor: object }).constructor
  return getMetadata(GATEWAY_MARKER_KEY, metadataTarget) === true
}
