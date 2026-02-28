import { type DynamicModule, type ModuleClass } from 'stratal/module'
import { TestingModuleBuilder, type TestingModuleConfig } from './testing-module-builder'

/**
 * Test
 *
 * Static class for creating testing modules.
 * Provides a NestJS-style API for configuring test modules.
 *
 * @example
 * ```typescript
 * // In vitest.setup.ts:
 * Test.setBaseModules([CoreModule])
 *
 * // In test files:
 * const module = await Test.createTestingModule({
 *   imports: [RegistrationModule, GeoModule],
 * })
 *   .overrideProvider(EMAIL_TOKENS.EmailService)
 *   .useValue(mockEmailService)
 *   .compile()
 * ```
 */
export class Test {
  /**
   * Base modules to include in all test modules
   * Set once in vitest.setup.ts
   */
  private static baseModules: (ModuleClass | DynamicModule)[] = []

  /**
   * Set base modules to include in all test modules
   * Should be called once in vitest.setup.ts
   *
   * @param modules - Modules to include before test-specific modules (e.g., CoreModule)
   */
  static setBaseModules(modules: (ModuleClass | DynamicModule)[]): void {
    this.baseModules = modules
  }

  /**
   * Get base modules
   */
  static getBaseModules(): (ModuleClass | DynamicModule)[] {
    return this.baseModules
  }

  /**
   * Create a testing module builder
   *
   * @param config - Configuration with modules and optional env overrides
   * @returns TestingModuleBuilder for configuring and compiling the module
   */
  static createTestingModule(config: TestingModuleConfig): TestingModuleBuilder {
    return new TestingModuleBuilder(config)
  }
}
