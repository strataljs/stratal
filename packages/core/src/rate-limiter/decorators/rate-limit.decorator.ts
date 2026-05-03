import { ROUTE_METADATA_KEYS } from '../../router/constants'

const KEY = ROUTE_METADATA_KEYS.RATE_LIMIT

/**
 * Apply a named rate limiter to a controller class or a single route method.
 *
 * Stacks: multiple `@RateLimit` decorators on the same target push onto
 * the metadata array — every named limiter is enforced. Class-level limits
 * run before method-level limits in the resulting middleware chain.
 *
 * The named limiter must be registered separately via
 * `RateLimiterRegistry.for('name', resolver)` (typically inside a
 * module's `onInitialize` hook) and the user must import
 * `RateLimiterModule.forRoot({ store: ... })` in their AppModule.
 *
 * @example
 * ```typescript
 * @Controller('/api/v1/users')
 * @RateLimit('api')
 * export class UsersController {
 *   @Get('/')
 *   list(ctx: RouterContext) { ... }
 *
 *   @Post('/')
 *   @RateLimit('writes')           // stacks with class-level 'api'
 *   create(ctx: RouterContext) { ... }
 * }
 * ```
 */
export function RateLimit(name: string): ClassDecorator & MethodDecorator {
  return (target: object, propertyKey?: string | symbol) => {
    if (propertyKey === undefined) {
      const existing = (Reflect.getOwnMetadata(KEY, target) as string[] | undefined) ?? []
      Reflect.defineMetadata(KEY, [...existing, name], target)
    } else {
      const existing = (Reflect.getOwnMetadata(KEY, target, propertyKey as string) as string[] | undefined) ?? []
      Reflect.defineMetadata(KEY, [...existing, name], target, propertyKey as string)
    }
  }
}

/**
 * Read the rate-limit names attached to a class or method via `@RateLimit`.
 * Returns an empty array when no decorator was applied.
 *
 * @param target - For class metadata, pass the controller constructor.
 *   For method metadata, pass `Controller.prototype` and the method name.
 */
export function getRateLimits(target: object, propertyKey?: string): string[] {
  const meta: unknown = propertyKey === undefined
    ? Reflect.getMetadata(KEY, target)
    : Reflect.getMetadata(KEY, target, propertyKey)
  return Array.isArray(meta) ? (meta as string[]) : []
}
