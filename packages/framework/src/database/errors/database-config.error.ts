import { ERROR_CODES } from 'stratal/errors'
import { DatabaseError } from './database-error'

export class DatabaseConfigError extends DatabaseError {
  constructor(details: string) {
    super('errors.databaseGeneric', ERROR_CODES.DATABASE.GENERIC, { details })
  }
}
