import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../infrastructure/error-handler'

/**
 * ModuleCircularDependencyError
 *
 * Thrown when a circular dependency is detected in the module dependency graph.
 * This prevents infinite loops during module initialization.
 */
export class ModuleCircularDependencyError extends ApplicationError {
  constructor(dependencyPath: string[]) {
    const cycle = dependencyPath.join(' -> ')
    super(
      'errors.moduleCircularDependency',
      ERROR_CODES.SYSTEM.MODULE_CIRCULAR_DEPENDENCY,
      { cycle }
    )
  }
}
