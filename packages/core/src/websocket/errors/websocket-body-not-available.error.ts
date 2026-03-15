import { ApplicationError, ERROR_CODES } from '../../errors'

export class WebSocketBodyNotAvailableError extends ApplicationError {
  constructor() {
    super(
      'errors.websocketBodyNotAvailable',
      ERROR_CODES.SYSTEM.WEBSOCKET_BODY_NOT_AVAILABLE
    )
  }
}
