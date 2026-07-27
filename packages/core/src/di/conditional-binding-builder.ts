import type { Container } from './container'
import { ContainerError } from './container.error'
import type { InjectionToken, WhenOptions } from './types'
import type { Constructor } from '../types'

export interface PredicateContainer {
  resolve<T>(token: InjectionToken<T>): T
  isRegistered<T>(token: InjectionToken<T>): boolean
}

export interface ConditionalBindingBuilder {
  use<T extends object>(token: InjectionToken<T>): ConditionalBindingUse<T>
}

export interface ConditionalBindingUse<T extends object> {
  give(implementation: Constructor<T>): ConditionalBindingGive<T>
}

export interface ConditionalBindingGive<T extends object> {
  otherwise(implementation: Constructor<T>): void
}

export class ConditionalBindingBuilderImpl implements ConditionalBindingBuilder {
  constructor(
    private readonly container: Container,
    private readonly predicate: (container: PredicateContainer) => boolean,
    private readonly options: WhenOptions,
  ) {}

  use<T extends object>(token: InjectionToken<T>): ConditionalBindingUse<T> {
    return new ConditionalBindingUseImpl<T>(
      this.container,
      this.predicate,
      this.options,
      token,
    )
  }
}

class ConditionalBindingUseImpl<T extends object> implements ConditionalBindingUse<T> {
  constructor(
    private readonly container: Container,
    private readonly predicate: (container: PredicateContainer) => boolean,
    private readonly options: WhenOptions,
    private readonly token: InjectionToken<T>,
  ) {}

  give(trueImpl: Constructor<T>): ConditionalBindingGive<T> {
    this.registerConditional(trueImpl, undefined)

    return {
      otherwise: (falseImpl: Constructor<T>) => {
        this.registerConditional(trueImpl, falseImpl)
      },
    }
  }

  private registerConditional(trueImpl: Constructor<T>, falseImpl: Constructor<T> | undefined): void {
    const { predicate, container, options, token } = this
    let cachedResult: boolean | undefined

    // Register both implementations so the container can instantiate them
    container.register(trueImpl)
    if (falseImpl) container.register(falseImpl)

    container.registerFactory(token, (c) => {
      let result: boolean
      if (options.cache && cachedResult !== undefined) {
        result = cachedResult
      } else {
        result = predicate(c)
        if (options.cache) cachedResult = result
      }

      if (result) {
        return c.resolve(trueImpl)
      }

      if (falseImpl) {
        return c.resolve(falseImpl)
      }

      const tokenStr = typeof token === 'symbol'
        ? (token.description ?? 'unknown')
        : typeof token === 'function'
          ? token.name
          : typeof token === 'string'
            ? token
            : 'lazy'
      throw new ContainerError(`No fallback registered for conditional binding "${tokenStr}". Use .otherwise() or register a default implementation.`)
    })
  }
}
