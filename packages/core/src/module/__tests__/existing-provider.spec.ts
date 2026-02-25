import type { DependencyContainer } from 'tsyringe'
import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMock } from '@stratal/testing/mocks'
import { type StratalEnv } from '../../env'
import { Container } from '../../di/container'
import { Scope } from '../../di/types'
import type { LoggerService } from '../../logger'
import { ModuleRegistry } from '../module-registry'
import { Module, getModuleOptions } from '../module.decorator'

// Test tokens
const USER_SERVICE_TOKEN = Symbol('UserService')
const I_USER_SERVICE_TOKEN = Symbol('IUserService')
const ALIAS_TOKEN = Symbol('AliasToken')

// Test service
@injectable()
class UserService {
  getName() {
    return 'UserService'
  }
}

// Create mock logger
const mockLogger = createMock<LoggerService>()

describe('ExistingProvider', () => {
  let childContainer: DependencyContainer
  let container: Container

  beforeEach(() => {
    // Create a fresh child container for each test
    childContainer = tsyringeRootContainer.createChildContainer()
    container = new Container({
      env: {} as StratalEnv,
      ctx: createMock<ExecutionContext>() as unknown as ExecutionContext,
      container: childContainer,
    })
  })

  describe('Container.registerExisting()', () => {
    it('should register an alias that resolves to the same instance', () => {
      // Register the concrete service as singleton
      container.registerSingleton(USER_SERVICE_TOKEN, UserService)

      // Register alias
      container.registerExisting(I_USER_SERVICE_TOKEN, USER_SERVICE_TOKEN)

      // Resolve both tokens
      const concrete = container.resolve<UserService>(USER_SERVICE_TOKEN)
      const alias = container.resolve<UserService>(I_USER_SERVICE_TOKEN)

      // They should be the same instance
      expect(concrete).toBe(alias)
      expect(concrete.getName()).toBe('UserService')
      expect(alias.getName()).toBe('UserService')
    })

    it('should work with class as token', () => {
      // Register the concrete service using class as token
      container.registerSingleton(UserService)

      // Register alias
      container.registerExisting(ALIAS_TOKEN, UserService)

      // Resolve both
      const concrete = container.resolve(UserService)
      const alias = container.resolve<UserService>(ALIAS_TOKEN)

      expect(concrete).toBe(alias)
    })

    it('should chain multiple aliases', () => {
      const ALIAS_1 = Symbol('Alias1')
      const ALIAS_2 = Symbol('Alias2')

      // Register concrete service
      container.registerSingleton(USER_SERVICE_TOKEN, UserService)

      // Chain aliases
      container.registerExisting(ALIAS_1, USER_SERVICE_TOKEN)
      container.registerExisting(ALIAS_2, ALIAS_1)

      // All should resolve to the same instance
      const concrete = container.resolve<UserService>(USER_SERVICE_TOKEN)
      const alias1 = container.resolve<UserService>(ALIAS_1)
      const alias2 = container.resolve<UserService>(ALIAS_2)

      expect(concrete).toBe(alias1)
      expect(concrete).toBe(alias2)
    })
  })

  describe('@Module decorator with useExisting', () => {
    it('should register existing provider via decorator', () => {
      @Module({
        providers: [
          { provide: USER_SERVICE_TOKEN, useClass: UserService },
          { provide: I_USER_SERVICE_TOKEN, useExisting: USER_SERVICE_TOKEN },
        ],
      })
      class TestModule { }

      // Get module options
      const options = getModuleOptions(TestModule)
      expect(options?.providers).toHaveLength(2)

      // Verify the provider types
      const existingProvider = options?.providers?.[1]
      expect(existingProvider).toHaveProperty('useExisting', USER_SERVICE_TOKEN)
    })
  })

  describe('ModuleRegistry with useExisting', () => {
    it('should register existing provider through ModuleRegistry', () => {
      @Module({
        providers: [
          { provide: USER_SERVICE_TOKEN, useClass: UserService, scope: Scope.Singleton },
          { provide: I_USER_SERVICE_TOKEN, useExisting: USER_SERVICE_TOKEN },
        ],
      })
      class TestModule { }

      const registry = new ModuleRegistry(container, mockLogger as unknown as LoggerService)
      registry.register(TestModule)

      // Resolve both tokens
      const concrete = container.resolve<UserService>(USER_SERVICE_TOKEN)
      const alias = container.resolve<UserService>(I_USER_SERVICE_TOKEN)

      expect(concrete).toBe(alias)
    })

    it('should work with dynamic modules', () => {
      @Module({
        providers: [{ provide: USER_SERVICE_TOKEN, useClass: UserService, scope: Scope.Singleton }],
      })
      class BaseModule {
        static withRoot() {
          return {
            module: BaseModule,
            providers: [
              { provide: I_USER_SERVICE_TOKEN, useExisting: USER_SERVICE_TOKEN },
            ],
          }
        }
      }

      const registry = new ModuleRegistry(container, mockLogger as unknown as LoggerService)
      registry.register(BaseModule.withRoot())

      // Resolve both tokens
      const concrete = container.resolve<UserService>(USER_SERVICE_TOKEN)
      const alias = container.resolve<UserService>(I_USER_SERVICE_TOKEN)

      expect(concrete).toBe(alias)
    })
  })
})
