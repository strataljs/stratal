import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { container as tsyringeRootContainer, injectable } from 'tsyringe'
import type { DependencyContainer } from 'tsyringe'
import type { StratalEnv } from '../../env'
import type { Constructor } from '../../types'
import { Container } from '../../di/container'
import { Scope } from '../../di/types'
import type { LoggerService } from '../../logger/services/logger.service'
import { Module } from '../module.decorator'
import { ModuleRegistry } from '../module-registry'

// Test tokens
const SERVICE_TOKEN = Symbol('TestService')
const IMPORTED_TOKEN = Symbol('ImportedService')

// Test services
@injectable()
class TestService {
  getValue() {
    return 'test'
  }
}

@injectable()
class ImportedService {
  getValue() {
    return 'imported'
  }
}

// Test controller and consumer
class TestController {}
class TestConsumer {}
class TestJob {}

describe('ModuleRegistry', () => {
  let childContainer: DependencyContainer
  let container: Container
  let mockLogger: DeepMocked<LoggerService>
  let registry: ModuleRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    childContainer = tsyringeRootContainer.createChildContainer()
    container = new Container({
      env: {} as StratalEnv,
      ctx: createMock<ExecutionContext>() as unknown as ExecutionContext,
      container: childContainer,
    })
    mockLogger = createMock<LoggerService>()
    registry = new ModuleRegistry(container, mockLogger as unknown as LoggerService)
  })

  describe('register()', () => {
    it('should register providers from module decorator', () => {
      @Module({
        providers: [
          { provide: SERVICE_TOKEN, useClass: TestService, scope: Scope.Singleton },
        ],
      })
      class TestModule {}

      registry.register(TestModule)

      const instance = container.resolve<TestService>(SERVICE_TOKEN)
      expect(instance).toBeInstanceOf(TestService)
      expect(instance.getValue()).toBe('test')
    })

    it('should register imported modules recursively', () => {
      @Module({
        providers: [
          { provide: IMPORTED_TOKEN, useClass: ImportedService, scope: Scope.Singleton },
        ],
      })
      class ChildModule {}

      @Module({
        imports: [ChildModule],
        providers: [
          { provide: SERVICE_TOKEN, useClass: TestService, scope: Scope.Singleton },
        ],
      })
      class ParentModule {}

      registry.register(ParentModule)

      const parentService = container.resolve<TestService>(SERVICE_TOKEN)
      const importedService = container.resolve<ImportedService>(IMPORTED_TOKEN)

      expect(parentService).toBeInstanceOf(TestService)
      expect(importedService).toBeInstanceOf(ImportedService)
    })

    it('should collect controllers', () => {
      @Module({
        controllers: [TestController as Constructor],
      })
      class TestModule {}

      registry.register(TestModule)

      expect(registry.getAllControllers()).toContain(TestController)
    })

    it('should collect consumers', () => {
      @Module({
        consumers: [TestConsumer as Constructor],
      })
      class TestModule {}

      registry.register(TestModule)

      expect(registry.getAllConsumers()).toContain(TestConsumer)
    })

    it('should collect jobs', () => {
      @Module({
        jobs: [TestJob as Constructor],
      })
      class TestModule {}

      registry.register(TestModule)

      expect(registry.getAllJobs()).toContain(TestJob)
    })
  })

  describe('initialize()', () => {
    it('should call onInitialize() lifecycle hook on modules', async () => {
      const onInitialize = vi.fn()

      @Module({ providers: [] })
      class TestModule {
        onInitialize = onInitialize
      }

      registry.register(TestModule)
      await registry.initialize()

      expect(onInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          container,
          logger: expect.anything(),
        })
      )
    })

    it('should call configure() for MiddlewareConfigurable modules', async () => {
      const configure = vi.fn()

      @Module({ providers: [] })
      class TestModule {
        configure = configure
      }

      registry.register(TestModule)
      await registry.initialize()

      expect(configure).toHaveBeenCalledWith(expect.any(Object))
    })
  })

  describe('DynamicModule registration', () => {
    it('should register providers from dynamic config', () => {
      const DYNAMIC_TOKEN = Symbol('DynamicService')

      @Module({ providers: [] })
      class BaseDynamicModule {
        static forRoot() {
          return {
            module: BaseDynamicModule,
            providers: [
              { provide: DYNAMIC_TOKEN, useValue: { value: 'dynamic-value' } },
            ],
          }
        }
      }

      registry.register(BaseDynamicModule.forRoot())

      const value = container.resolve<{ value: string }>(DYNAMIC_TOKEN)
      expect(value).toEqual({ value: 'dynamic-value' })
    })
  })

  describe('duplicate module handling', () => {
    it('should skip duplicate static modules', () => {
      @Module({
        providers: [
          { provide: SERVICE_TOKEN, useClass: TestService, scope: Scope.Singleton },
        ],
      })
      class TestModule {}

      registry.register(TestModule)
      registry.register(TestModule)

      // Should log debug about skipping
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('already registered')
      )
    })
  })

  describe('shutdown()', () => {
    it('should call onShutdown in reverse order', async () => {
      const shutdownOrder: string[] = []

      @Module({ providers: [] })
      class ModuleA {
        onShutdown = vi.fn(() => {
          shutdownOrder.push('A')
        })
      }

      @Module({ providers: [] })
      class ModuleB {
        onShutdown = vi.fn(() => {
          shutdownOrder.push('B')
        })
      }

      registry.register(ModuleA)
      registry.register(ModuleB)
      await registry.initialize()
      await registry.shutdown()

      expect(shutdownOrder).toEqual(['B', 'A'])
    })
  })
})
