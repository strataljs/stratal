/**
 * Method Parameter Injection Decorator
 *
 * Enables DI for controller method parameters. Parameters marked with
 * @InjectParam(token) are resolved from the request-scoped container
 * at method invocation time.
 *
 * @example
 * ```typescript
 * @Route({ response: userSchema })
 * async show(
 *   ctx: RouterContext,
 *   @InjectParam(UserService) userService: UserService,
 *   @InjectParam(CacheService) cache: CacheService
 * ): Promise<Response> {
 *   // userService and cache auto-resolved from request container
 * }
 * ```
 */
import type InjectionToken from 'tsyringe/dist/typings/providers/injection-token'

/**
 * Metadata key for storing parameter injection information
 */
export const INJECT_PARAM_METADATA_KEY = Symbol.for('stratal:inject:param')

/**
 * Describes a parameter injection
 */
export interface ParamInjection {
  /** Parameter index in the method signature (0-based) */
  index: number
  /** DI token to resolve */
  token: InjectionToken
}

/**
 * Mark a method parameter for DI injection
 *
 * The parameter will be resolved from the request-scoped container
 * when the controller method is invoked.
 *
 * @param token - DI token to resolve (class or symbol)
 *
 * @example With class token
 * ```typescript
 * async show(
 *   ctx: RouterContext,
 *   @InjectParam(UserService) userService: UserService
 * ) { }
 * ```
 *
 * @example With symbol token
 * ```typescript
 * async show(
 *   ctx: RouterContext,
 *   @InjectParam(DI_TOKENS.Cache) cache: ICacheService
 * ) { }
 * ```
 */
export function InjectParam<T>(token: InjectionToken<T>): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    if (propertyKey === undefined) {
      throw new Error('@InjectParam can only be used on method parameters, not constructor parameters')
    }

    const existingInjections: ParamInjection[] =
      (Reflect.getMetadata(INJECT_PARAM_METADATA_KEY, target, propertyKey) as ParamInjection[] | undefined) ?? []

    existingInjections.push({
      index: parameterIndex,
      token,
    })

    Reflect.defineMetadata(INJECT_PARAM_METADATA_KEY, existingInjections, target, propertyKey)
  }
}

/**
 * Get method parameter injections
 *
 * @param target - Controller prototype
 * @param propertyKey - Method name
 * @returns Array of parameter injections sorted by index
 */
export function getMethodInjections(target: object, propertyKey: string | symbol): ParamInjection[] {
  const injections: ParamInjection[] =
    (Reflect.getMetadata(INJECT_PARAM_METADATA_KEY, target, propertyKey) as ParamInjection[] | undefined) ?? []

  return injections.sort((a, b) => a.index - b.index)
}
