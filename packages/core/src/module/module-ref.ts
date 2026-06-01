import type { Container } from '../di/container'
import type { InjectionToken } from '../di/types'
import type { Constructor } from '../types'

/**
 * Handle to a lazily loaded module, returned by {@link LazyModuleLoader.load}.
 *
 * Resolves providers from the global container, so singletons registered by the
 * lazy module persist across requests.
 *
 * Note: request-scoped providers resolved via {@link ModuleRef.get} degrade to
 * transient instances (there is no ambient request scope here). To obtain a
 * true per-request instance, resolve the token from the request container
 * inside a request scope instead.
 */
export class ModuleRef {
  constructor(
    private readonly container: Container,
    /** The module class this ref was loaded from. */
    readonly moduleClass: Constructor,
  ) { }

  /** Resolve a provider from the lazily loaded module (global scope). */
  get<T>(token: InjectionToken<T>): T {
    return this.container.resolve(token)
  }

  /** Async variant of {@link ModuleRef.get}, matching the NestJS API shape. */
  resolve<T>(token: InjectionToken<T>): Promise<T> {
    return Promise.resolve(this.container.resolve(token))
  }
}
