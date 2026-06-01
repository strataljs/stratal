import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { Container } from '../../di/container'
import { DI_TOKENS } from '../../di/tokens'
import { Transient } from '../../di/decorators'
import type { LoggerService } from '../../logger/services/logger.service'
import { LazyModuleLoader } from '../lazy-module-loader'
import { Module } from '../module.decorator'
import { ModuleRegistry } from '../module-registry'
import type { DynamicModule, ModuleClass, ModuleContext, OnInitialize } from '../types'

const LAZY_TOKEN = Symbol('LazyService')
const NESTED_TOKEN = Symbol('NestedService')
const VALUE_TOKEN = Symbol('LazyValue')

@Transient()
class LazyService {
  getValue() {
    return 'lazy'
  }
}

@Transient()
class NestedService {
  getValue() {
    return 'nested'
  }
}

describe('Lazy module loading', () => {
  let container: Container
  let mockLogger: DeepMocked<LoggerService>
  let registry: ModuleRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    container = new Container()
    mockLogger = createMock<LoggerService>()
    registry = new ModuleRegistry(container, mockLogger as unknown as LoggerService)
  })

  describe('ModuleRegistry.registerLazy()', () => {
    it('registers providers and runs onInitialize once', async () => {
      let initCount = 0

      @Module({ providers: [{ provide: LAZY_TOKEN, useClass: LazyService }] })
      class LazyModule implements OnInitialize {
        onInitialize(_ctx: ModuleContext): void {
          initCount++
        }
      }

      await registry.registerLazy(LazyModule)

      expect(container.resolve<LazyService>(LAZY_TOKEN)).toBeInstanceOf(LazyService)
      expect(initCount).toBe(1)

      // Re-registering is a no-op (dedup) and does not re-run lifecycle
      await registry.registerLazy(LazyModule)
      expect(initCount).toBe(1)
    })

    it('registers nested imports recursively', async () => {
      @Module({ providers: [{ provide: NESTED_TOKEN, useClass: NestedService }] })
      class NestedModule {}

      @Module({
        imports: [NestedModule],
        providers: [{ provide: LAZY_TOKEN, useClass: LazyService }],
      })
      class ParentModule {}

      await registry.registerLazy(ParentModule)

      expect(container.resolve<NestedService>(NESTED_TOKEN)).toBeInstanceOf(NestedService)
      expect(container.resolve<LazyService>(LAZY_TOKEN)).toBeInstanceOf(LazyService)
    })

    it('skips controllers/consumers/jobs and warns', async () => {
      class LazyController {}
      class LazyConsumer {}
      class LazyJob {}

      @Module({
        controllers: [LazyController],
        consumers: [LazyConsumer],
        jobs: [LazyJob],
        providers: [{ provide: LAZY_TOKEN, useClass: LazyService }],
      })
      class LazyHttpModule {}

      await registry.registerLazy(LazyHttpModule)

      expect(registry.getAllControllers()).toHaveLength(0)
      expect(registry.getAllConsumers()).toHaveLength(0)
      expect(registry.getAllJobs()).toHaveLength(0)
      expect(mockLogger.warn).toHaveBeenCalledOnce()
    })

    it('wires extra providers from a DynamicModule', async () => {
      @Module({ providers: [{ provide: LAZY_TOKEN, useClass: LazyService }] })
      class ConfigurableModule {
        static forRoot(): DynamicModule {
          return {
            module: ConfigurableModule,
            providers: [{ provide: VALUE_TOKEN, useValue: { configured: true } }],
          }
        }
      }

      await registry.registerLazy(ConfigurableModule.forRoot())

      expect(container.resolve<LazyService>(LAZY_TOKEN)).toBeInstanceOf(LazyService)
      expect(container.resolve(VALUE_TOKEN)).toEqual({ configured: true })
    })

    it('dedups against an eagerly registered module', async () => {
      let initCount = 0

      @Module({ providers: [{ provide: LAZY_TOKEN, useClass: LazyService }] })
      class SharedModule implements OnInitialize {
        onInitialize(_ctx: ModuleContext): void {
          initCount++
        }
      }

      registry.register(SharedModule)
      expect(registry.hasRegistered(SharedModule)).toBe(true)

      await registry.registerLazy(SharedModule)
      // Eager register() does not run onInitialize (that is the batch
      // initialize() job); lazy registerLazy() must not run it for an
      // already-registered module either.
      expect(initCount).toBe(0)
    })
  })

  describe('LazyModuleLoader', () => {
    let loader: LazyModuleLoader

    beforeEach(() => {
      container.registerValue(DI_TOKENS.ModuleRegistry, registry)
      loader = new LazyModuleLoader(
        registry,
        container,
        mockLogger as unknown as LoggerService,
      )
    })

    it('loads a module and resolves providers via the returned ModuleRef', async () => {
      @Module({ providers: [{ provide: LAZY_TOKEN, useClass: LazyService }] })
      class ReportsModule {}

      const ref = await loader.load(() => Promise.resolve(ReportsModule as unknown as ModuleClass))

      expect(ref.moduleClass).toBe(ReportsModule)
      expect(ref.get<LazyService>(LAZY_TOKEN)).toBeInstanceOf(LazyService)
      expect(await ref.resolve<LazyService>(LAZY_TOKEN)).toBeInstanceOf(LazyService)
    })

    it('returns the same cached ModuleRef on repeat load without re-initializing', async () => {
      let initCount = 0

      @Module({ providers: [{ provide: LAZY_TOKEN, useClass: LazyService }] })
      class CachedModule implements OnInitialize {
        onInitialize(_ctx: ModuleContext): void {
          initCount++
        }
      }

      const first = await loader.load(() => Promise.resolve(CachedModule as unknown as ModuleClass))
      const second = await loader.load(() => Promise.resolve(CachedModule as unknown as ModuleClass))

      expect(second).toBe(first)
      expect(initCount).toBe(1)
    })

    it('registers into the root container when loaded from a request scope', async () => {
      @Module({ providers: [{ provide: LAZY_TOKEN, useClass: LazyService }] })
      class ScopedModule {}

      const child = container.createRequestScope({
        getLocale: () => 'en',
        setLocale: () => { /* no-op */ },
        getContainer: () => container,
      } as never)

      const scopedLoader = new LazyModuleLoader(
        registry,
        child,
        mockLogger as unknown as LoggerService,
      )

      const ref = await scopedLoader.load(() => Promise.resolve(ScopedModule as unknown as ModuleClass))

      // Registered on root → resolvable from the parent (global) container too
      expect(container.resolve<LazyService>(LAZY_TOKEN)).toBeInstanceOf(LazyService)
      expect(ref.get<LazyService>(LAZY_TOKEN)).toBeInstanceOf(LazyService)
    })
  })
})
