import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class FileNotFoundError extends ApplicationError {
  constructor(path: string) {
    super('errors.storage.fileNotFound', ERROR_CODES.RESOURCE.NOT_FOUND, { path })
  }
}
