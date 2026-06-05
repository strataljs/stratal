import { HttpException } from '../../errors'

export class InvalidFileTypeError extends HttpException {
  constructor(public readonly mimeType?: string) {
    super(422, 'Invalid file type')
  }
}
