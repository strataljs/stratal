import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * ModuleAlreadyRegisteredError
 *
 * Thrown when attempting to register a module that is already registered.
 * This prevents duplicate module registration which could cause unexpected behavior.
 */
export class ModuleAlreadyRegisteredError extends ApplicationError {
  constructor(moduleName: string) {
    super(
      'errors.moduleAlreadyRegistered',
      ERROR_CODES.SYSTEM.MODULE_ALREADY_REGISTERED,
      { moduleName }
    )
  }
}
