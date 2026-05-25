import { HttpException } from '../../errors'

export class FileNotFoundError extends HttpException {
  constructor(path?: string) {
    super(404, path ? `File not found: "${path}"` : 'File not found')
  }
}
