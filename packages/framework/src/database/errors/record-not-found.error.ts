import { HttpException } from 'stratal/errors'

export class RecordNotFoundError extends HttpException {
  constructor(public readonly details?: string, cause?: unknown) {
    super(404, 'Record not found', cause)
  }
}
