import { ROUTE_METADATA_KEYS } from '../../router/constants'
import type { Constructor } from '../../types'

const WS_ON_MESSAGE_KEY = ROUTE_METADATA_KEYS.WS_ON_MESSAGE
const WS_ON_CLOSE_KEY = ROUTE_METADATA_KEYS.WS_ON_CLOSE
const WS_ON_ERROR_KEY = ROUTE_METADATA_KEYS.WS_ON_ERROR

/**
 * Marks a method as the WebSocket message handler
 *
 * @example
 * ```typescript
 * @Gateway('/ws/chat')
 * class ChatGateway {
 *   @OnMessage()
 *   handleMessage(evt: MessageEvent, ctx: GatewayContext) {
 *     ctx.send(evt.data)
 *   }
 * }
 * ```
 */
export function OnMessage(): MethodDecorator {
  // `_target` is the class prototype (method decorator convention).
  // The getter functions below read from `target.prototype` symmetrically.
  return (_target: object, propertyKey: string | symbol) => {
    Reflect.defineMetadata(WS_ON_MESSAGE_KEY, propertyKey as string, _target)
  }
}

/**
 * Marks a method as the WebSocket close handler
 *
 * @example
 * ```typescript
 * @Gateway('/ws/chat')
 * class ChatGateway {
 *   @OnClose()
 *   handleClose(evt: CloseEvent, ctx: GatewayContext) {
 *     console.log('closed')
 *   }
 * }
 * ```
 */
export function OnClose(): MethodDecorator {
  return (_target: object, propertyKey: string | symbol) => {
    Reflect.defineMetadata(WS_ON_CLOSE_KEY, propertyKey as string, _target)
  }
}

/**
 * Marks a method as the WebSocket error handler
 *
 * @example
 * ```typescript
 * @Gateway('/ws/chat')
 * class ChatGateway {
 *   @OnError()
 *   handleError(evt: Event, ctx: GatewayContext) {
 *     console.error('WebSocket error', evt)
 *   }
 * }
 * ```
 */
export function OnError(): MethodDecorator {
  return (_target: object, propertyKey: string | symbol) => {
    Reflect.defineMetadata(WS_ON_ERROR_KEY, propertyKey as string, _target)
  }
}

/**
 * Get the method name decorated with @OnMessage
 */
export function getWsOnMessageMethod(target: Constructor): string | undefined {
  return Reflect.getMetadata(WS_ON_MESSAGE_KEY, target.prototype as object) as string | undefined
}

/**
 * Get the method name decorated with @OnClose
 */
export function getWsOnCloseMethod(target: Constructor): string | undefined {
  return Reflect.getMetadata(WS_ON_CLOSE_KEY, target.prototype as object) as string | undefined
}

/**
 * Get the method name decorated with @OnError
 */
export function getWsOnErrorMethod(target: Constructor): string | undefined {
  return Reflect.getMetadata(WS_ON_ERROR_KEY, target.prototype as object) as string | undefined
}
