import type { Container } from '../di'
import type { LoggerService } from '../logger'
import type { RouterContext } from '../router'
import type { CanActivate, Guard } from './types'

/**
 * Guard Execution Service
 *
 * Executes guards for a route and determines if the request should proceed.
 * Guards are executed in order; all must pass for the request to proceed.
 */
export class GuardExecutionService {
  constructor(private readonly logger: LoggerService) { }

  /**
   * Execute all guards for a route
   *
   * @param guards - Array of guards (classes or instances)
   * @param context - Router context
   * @param container - Request-scoped DI container
   * @returns true if all guards pass
   * @throws Error from first failing guard
   */
  async executeGuards(
    guards: Guard[],
    context: RouterContext,
    container: Container
  ): Promise<boolean> {
    if (guards.length === 0) {
      return true
    }

    this.logger.debug('Executing guards', {
      guardCount: guards.length,
      path: context.c.req.path,
      method: context.c.req.method,
    })

    for (const guard of guards) {
      const guardInstance = this.resolveGuard(guard, container)
      const canActivate = await guardInstance.canActivate(context)

      if (!canActivate) {
        this.logger.debug('Guard denied access', {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guard.constructor may be null at runtime
          guard: guard.constructor?.name || 'AnonymousGuard',
          path: context.c.req.path,
        })
        return false
      }
    }

    this.logger.debug('All guards passed', {
      guardCount: guards.length,
      path: context.c.req.path,
    })

    return true
  }

  /**
   * Resolve a guard to an instance
   *
   * @param guard - Guard class or instance
   * @param container - Request-scoped DI container
   * @returns Guard instance
   */
  private resolveGuard(guard: Guard, container: Container): CanActivate {
    // If already an instance (has canActivate method), use directly
    if (this.isGuardInstance(guard)) {
      return guard
    }

    // Otherwise, resolve from container
    return container.resolve<CanActivate>(guard)
  }

  /**
   * Type guard to check if value is a guard instance
   */
  private isGuardInstance(guard: Guard): guard is CanActivate {
    return (
      typeof guard === 'object' &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typeof null === 'object', null check is required
      guard !== null &&
      'canActivate' in guard &&
      typeof guard.canActivate === 'function'
    )
  }
}
