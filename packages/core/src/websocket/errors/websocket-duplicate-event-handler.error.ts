import { ApplicationError, ERROR_CODES } from '../../errors'

export class WebSocketDuplicateEventHandlerError extends ApplicationError {
  constructor(decorator: string, existingMethod: string) {
    super(
      'errors.websocketDuplicateEventHandler',
      ERROR_CODES.SYSTEM.WEBSOCKET_DUPLICATE_EVENT_HANDLER,
      { decorator, existingMethod }
    )
  }
}
