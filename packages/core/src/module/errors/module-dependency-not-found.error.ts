import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../infrastructure/error-handler'

/**
 * ModuleDependencyNotFoundError
 *
 * Thrown when a module declares a dependency on another module that hasn't been registered.
 * This indicates a missing module or incorrect dependency declaration.
 */
export class ModuleDependencyNotFoundError extends ApplicationError {
  constructor(dependency: string, moduleName?: string) {
    super(
      'errors.moduleDependencyNotFound',
      ERROR_CODES.SYSTEM.MODULE_DEPENDENCY_NOT_FOUND,
      { dependency, moduleName }
    )
  }
}
