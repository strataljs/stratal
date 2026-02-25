import { GUARD_METADATA_KEY, type Guard, type GuardMetadata } from './types'

/**
 * UseGuards Decorator
 *
 * Applies one or more guards to a controller or method.
 * Guards are executed in order and all must pass for the request to proceed.
 *
 * **Execution Order:**
 * 1. Request → Global Middlewares → Route Middlewares
 * 2. **Guards (controller-level, then method-level)**
 * 3. Route Handler
 *
 * **Guard Resolution:**
 * - Guard classes are resolved from the request-scoped DI container
 * - Guard instances (from factory functions) are used directly
 *
 * @param guards - Guard classes or instances to apply
 *
 * @example Authentication only
 * ```typescript
 * @TenantController('/api/v1/profile')
 * @UseGuards(AuthGuard())
 * export class ProfileController {
 *   show() { } // Requires authentication
 * }
 * ```
 *
 * @example Authentication with permissions
 * ```typescript
 * @TenantController('/api/v1/students')
 * @UseGuards(AuthGuard({ scopes: ['students:read'] }))
 * export class StudentsController {
 *   index() { } // Requires 'students:read' permission
 * }
 * ```
 *
 * @example Method-level guards
 * ```typescript
 * @TenantController('/api/v1/students')
 * @UseGuards(AuthGuard()) // Controller-level: auth only
 * export class StudentsController {
 *   index() { } // Auth only (inherited)
 *
 *   @UseGuards(AuthGuard({ scopes: ['students:create'] }))
 *   create() { } // Auth + 'students:create' permission
 * }
 * ```
 *
 * @example Multiple guards
 * ```typescript
 * @UseGuards(AuthGuard(), RateLimitGuard(), TenantGuard())
 * export class SecureController {
 *   // All guards must pass
 * }
 * ```
 */
export function UseGuards(...guards: Guard[]): ClassDecorator & MethodDecorator {
  return (target: object, propertyKey?: string | symbol) => {
    const metadata: GuardMetadata = { guards }

    if (propertyKey !== undefined) {
      // Method decorator - store on method
      Reflect.defineMetadata(GUARD_METADATA_KEY, metadata, target, propertyKey)
    } else {
      // Class decorator - store on class
      Reflect.defineMetadata(GUARD_METADATA_KEY, metadata, target)
    }
  }
}

/**
 * Get controller-level guard metadata
 *
 * @param target - Controller class
 * @returns Guard metadata or undefined if not decorated
 */
export function getControllerGuards(target: object): GuardMetadata | undefined {
  return Reflect.getMetadata(GUARD_METADATA_KEY, target) as GuardMetadata | undefined
}

/**
 * Get method-level guard metadata
 *
 * @param target - Controller prototype
 * @param propertyKey - Method name
 * @returns Guard metadata or undefined if not decorated
 */
export function getMethodGuards(target: object, propertyKey: string | symbol): GuardMetadata | undefined {
  return Reflect.getMetadata(GUARD_METADATA_KEY, target, propertyKey) as GuardMetadata | undefined
}
