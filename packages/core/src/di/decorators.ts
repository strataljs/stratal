/**
 * DI Decorators
 *
 * Provides decorators for dependency injection:
 * - @Transient: Mark classes as injectable (lifecycle controlled at registration)
 * - @InjectParam: Inject dependencies into method parameters
 *
 * Lifecycle (Singleton, Request, Transient) is controlled at registration time
 * via the `scope` property in module providers or Container.register().
 */
import { injectable } from 'tsyringe'
import type InjectionToken from 'tsyringe/dist/typings/providers/injection-token'

// Re-export method parameter injection
export {
  InjectParam,
  getMethodInjections,
  type ParamInjection,
  INJECT_PARAM_METADATA_KEY,
} from './decorators/inject-param.decorator'

/**
 * Mark a class as injectable
 *
 * This decorator wraps tsyringe's `@injectable` decorator and optionally
 * associates a token with the class. The actual lifecycle (Singleton, Request,
 * Transient) is determined at registration time, not decoration time.
 *
 * **Lifecycle Control:**
 * - Use `scope: Scope.Singleton` in module providers for singleton
 * - Use `scope: Scope.Request` in module providers for request-scoped
 * - Default is Transient (new instance per resolution)
 *
 * @param token - Optional DI token for service resolution
 *
 * @example Basic usage (no token)
 * ```typescript
 * @Transient()
 * export class UserService {
 *   constructor(@inject(DI_TOKENS.Database) private db: DatabaseService) {}
 * }
 *
 * // In module:
 * @Module({
 *   providers: [UserService]  // Transient by default
 * })
 * ```
 *
 * @example With token
 * ```typescript
 * @Transient(DI_TOKENS.ConnectionManager)
 * export class ConnectionManager implements Disposable {
 *   // ...
 * }
 *
 * // In Application.ts:
 * container.register(DI_TOKENS.ConnectionManager, ConnectionManager, Scope.Request)
 * ```
 *
 * @example Singleton via provider scope
 * ```typescript
 * @Transient()
 * export class ConsumerRegistry {
 *   // ...
 * }
 *
 * // In module:
 * @Module({
 *   providers: [
 *     { provide: DI_TOKENS.ConsumerRegistry, useClass: ConsumerRegistry, scope: Scope.Singleton }
 *   ]
 * })
 * ```
 */
export function Transient<T>(token?: InjectionToken<T>) {
  return function <TFunction extends abstract new (...args: never[]) => unknown>(target: TFunction): TFunction {
    const targetConstructor = target as unknown as new (...args: unknown[]) => T
    injectable<T>({ token })(targetConstructor)
    return target
  }
}
