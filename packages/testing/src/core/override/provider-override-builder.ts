import { type InjectionToken } from 'stratal/module'
import type { TestingModuleBuilder } from '../testing-module-builder'

/**
 * Provider override configuration
 */
export interface ProviderOverrideConfig<T = unknown> {
  token: InjectionToken<T>
  type: 'value' | 'class' | 'factory' | 'existing'
  implementation: T | (new (...args: unknown[]) => T) | ((container: Container) => T) | InjectionToken<T>
}

/**
 * Fluent builder for provider overrides
 *
 * Provides a NestJS-style API for overriding providers in tests.
 *
 * @example
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [RegistrationModule],
 * })
 *   .overrideProvider(EMAIL_TOKENS.EmailService)
 *   .useValue(mockEmailService)
 *   .compile()
 * ```
 */
export class ProviderOverrideBuilder<T> {
  constructor(
    private readonly parent: TestingModuleBuilder,
    private readonly token: InjectionToken<T>
  ) { }

  /**
   * Use a static value as the provider
   *
   * The value will be registered directly in the container.
   *
   * @param value - The value to use as the provider
   * @returns The parent TestingModuleBuilder for chaining
   */
  useValue(value: T): TestingModuleBuilder {
    return this.parent.addProviderOverride({
      token: this.token,
      type: 'value',
      implementation: value,
    })
  }

  /**
   * Use a class as the provider
   *
   * The class will be registered as a singleton.
   *
   * @param cls - The class constructor to use as the provider
   * @returns The parent TestingModuleBuilder for chaining
   */
  useClass(cls: new (...args: unknown[]) => T): TestingModuleBuilder {
    return this.parent.addProviderOverride({
      token: this.token,
      type: 'class',
      implementation: cls,
    })
  }

  /**
   * Use a factory function as the provider
   *
   * The factory receives the container and should return the provider instance.
   *
   * @param factory - Factory function that creates the provider
   * @returns The parent TestingModuleBuilder for chaining
   */
  useFactory(factory: (container: Container) => T): TestingModuleBuilder {
    return this.parent.addProviderOverride({
      token: this.token,
      type: 'factory',
      implementation: factory,
    })
  }

  /**
   * Use an existing token as the provider (alias)
   *
   * The override token will resolve to the same instance as the target token.
   *
   * @param existingToken - The token to alias
   * @returns The parent TestingModuleBuilder for chaining
   *
   * @example
   * ```typescript
   * const module = await Test.createTestingModule({
   *   imports: [MyModule],
   * })
   *   .overrideProvider(ABSTRACT_TOKEN)
   *   .useExisting(ConcreteService)
   *   .compile()
   * ```
   */
  useExisting(existingToken: InjectionToken<T>): TestingModuleBuilder {
    return this.parent.addProviderOverride({
      token: this.token,
      type: 'existing',
      implementation: existingToken,
    })
  }
}
