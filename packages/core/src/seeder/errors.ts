import { ApplicationError, ERROR_CODES } from '../errors'

export class SeederNotRegisteredError extends ApplicationError {
  constructor(name: string) {
    super(
      'errors.seederNotRegistered',
      ERROR_CODES.SYSTEM.SEEDER_NOT_REGISTERED,
      { name },
    )
  }
}

export class SeederNameCollisionError extends ApplicationError {
  constructor(name: string) {
    super(
      'errors.seederNameCollision',
      ERROR_CODES.SYSTEM.SEEDER_NAME_COLLISION,
      { name },
    )
  }
}
