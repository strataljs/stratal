/**
 * Conditional Binding Builder
 *
 * Provides a fluent API for predicate-based service registration.
 * The predicate is evaluated lazily at resolution time using tsyringe's
 * predicateAwareClassFactory.
 *
 * @example With explicit fallback
 * ```typescript
 * container
 *   .when((c) => c.resolve(CONFIG_TOKEN).get('env') === 'development')
 *   .use(FORMATTER_TOKEN)
 *   .give(PrettyFormatter)
 *   .otherwise(JsonFormatter)
 * ```
 *
 * @example Without fallback (uses existing registration)
 * ```typescript
 * container
 *   .when((c) => c.resolve(FEATURE_FLAG_TOKEN).isEnabled('newFeature'))
 *   .use(SERVICE_TOKEN)
 *   .give(NewServiceImpl)  // Falls back to existing if predicate is false
 * ```
 */

import type { DependencyContainer } from 'tsyringe'
import { predicateAwareClassFactory } from 'tsyringe'
import type InjectionToken from 'tsyringe/dist/typings/providers/injection-token'
import type { Constructor } from '../types'
import { ConditionalBindingFallbackError } from './errors'
import type { WhenOptions } from './types'

/**
 * Container interface for predicate functions
 * Using a minimal interface to avoid circular imports
 */
export interface PredicateContainer {
  resolve<T>(token: InjectionToken<T>): T
  isRegistered<T>(token: InjectionToken<T>): boolean
}

/**
 * Initial builder returned by container.when()
 */
export interface ConditionalBindingBuilder {
  /**
   * Specify the token to conditionally bind
   *
   * @param token - DI token for the service
   * @returns Builder for specifying implementations
   */
  use<T extends object>(token: InjectionToken<T>): ConditionalBindingUse<T>
}

/**
 * Builder after specifying token with use()
 */
export interface ConditionalBindingUse<T extends object> {
  /**
   * Specify the implementation when predicate returns true.
   * Registration is completed immediately.
   *
   * If predicate is false at resolution time:
   * - Uses `otherwise()` implementation if provided
   * - Falls back to existing registration if available
   * - Throws error if no fallback exists
   *
   * @param implementation - Service class to use when predicate is true
   * @returns Builder for optional fallback specification
   */
  give(implementation: Constructor<T>): ConditionalBindingGive<T>
}

/**
 * Builder after specifying true implementation with give()
 * Registration is already complete at this point.
 */
export interface ConditionalBindingGive<T extends object> {
  /**
   * Optionally specify a fallback implementation when predicate returns false.
   * This re-registers with the explicit fallback instead of existing registration.
   *
   * @param implementation - Service class to use when predicate is false
   */
  otherwise(implementation: Constructor<T>): void
}

/**
 * Implementation of ConditionalBindingBuilder
 *
 * @internal
 */
export class ConditionalBindingBuilderImpl implements ConditionalBindingBuilder {
  constructor(
    private readonly tsyringeContainer: DependencyContainer,
    private readonly predicateContainer: PredicateContainer,
    private readonly predicate: (container: PredicateContainer) => boolean,
    private readonly options: WhenOptions
  ) { }

  use<T extends object>(token: InjectionToken<T>): ConditionalBindingUse<T> {
    return new ConditionalBindingUseImpl<T>(
      this.tsyringeContainer,
      this.predicateContainer,
      this.predicate,
      this.options,
      token
    )
  }
}

/**
 * Implementation of ConditionalBindingUse
 *
 * @internal
 */
class ConditionalBindingUseImpl<T extends object> implements ConditionalBindingUse<T> {
  constructor(
    private readonly tsyringeContainer: DependencyContainer,
    private readonly predicateContainer: PredicateContainer,
    private readonly predicate: (container: PredicateContainer) => boolean,
    private readonly options: WhenOptions,
    private readonly token: InjectionToken<T>
  ) { }

  give(trueImplementation: Constructor<T>): ConditionalBindingGive<T> {
    // Get fallback: existing registration or a class that throws
    const falseImplementation = this.getFallbackImplementation()

    // Register using predicateAwareClassFactory
    this.registerWithPredicate(trueImplementation, falseImplementation)

    // Return builder for optional otherwise()
    return {
      otherwise: (implementation: Constructor<T>) => {
        this.registerWithPredicate(trueImplementation, implementation,)
      },
    }
  }

  /**
   * Get fallback implementation: existing registration or throw-on-resolve class
   */
  private getFallbackImplementation(): Constructor<T> {
    // Check if token is already registered
    if (this.tsyringeContainer.isRegistered(this.token)) {
      // Create a class that resolves the existing registration
      // We need to capture the current registration before we overwrite it
      const existingInstance = this.tsyringeContainer.resolve<T>(this.token)

      // Return a "class" that just returns the existing instance
      // Using a factory wrapper since predicateAwareClassFactory expects a constructor
      return class ExistingInstanceWrapper {
        static instance = existingInstance
        constructor() {
          return ExistingInstanceWrapper.instance as unknown as ExistingInstanceWrapper
        }
      } as unknown as Constructor<T>
    }

    // No existing registration - create a class that throws
    const tokenStr = typeof this.token === 'symbol'
      ? (this.token.description ?? 'unknown')
      : typeof this.token === 'function'
        ? this.token.name
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- token can be string or object; String() is intentional fallback
        : String(this.token)
    return class NoFallbackError {
      constructor() {
        throw new ConditionalBindingFallbackError(tokenStr)
      }
    } as unknown as Constructor<T>
  }

  private registerWithPredicate(
    trueImplementation: Constructor<T>,
    falseImplementation: Constructor<T>
  ): void {
    const { predicate, predicateContainer, options } = this

    this.tsyringeContainer.register(this.token, {
      useFactory: predicateAwareClassFactory<T>(
        () => predicate(predicateContainer),
        trueImplementation,
        falseImplementation,
        options.cache ?? false
      )
    })
  }
}
