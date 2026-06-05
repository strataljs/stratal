import { HttpException } from '../../errors'

export class FileTooLargeError extends HttpException {
  constructor(public readonly size?: number, public readonly maxSize?: number) {
    super(413, 'File too large')
  }
}
