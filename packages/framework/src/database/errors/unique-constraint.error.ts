import { HttpException } from 'stratal/errors'

export class UniqueConstraintError extends HttpException {
  constructor(public readonly fields?: string[], cause?: unknown) {
    super(409, 'Record already exists', cause)
  }
}
