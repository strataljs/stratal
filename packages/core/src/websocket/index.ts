export type { WSContext, WSEvents, WSMessageReceive, WSReadyState } from 'hono/ws'
export { Gateway, isGateway, OnMessage, OnClose, OnError, getWsOnMessageMethod, getWsOnCloseMethod, getWsOnErrorMethod } from './decorators'
export { WebSocketBodyNotAvailableError } from './errors/websocket-body-not-available.error'
export { WebSocketDuplicateEventHandlerError } from './errors/websocket-duplicate-event-handler.error'
export { GatewayContext } from './gateway-context'
export type { GatewayOptions } from './types'

