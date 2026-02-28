import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { bench, describe } from 'vitest'
import { Container } from '../../di/container'
import { Scope } from '../../di/types'
import type { StratalEnv } from '../../env'
import type { LoggerService } from '../../logger'
import { ModuleRegistry } from '../module-registry'
import { Module } from '../module.decorator'
import type { ModuleContext, OnInitialize } from '../types'

// Fixtures

const TOKEN_SVC = Symbol('BenchModuleSvc')

@injectable()
class BenchService { }

@injectable()
class BenchServiceB { }

@injectable()
class BenchServiceC { }

@Module({
  providers: [
    { provide: TOKEN_SVC, useClass: BenchService, scope: Scope.Singleton },
  ],
})
class SingleModule { }

@Module({
  providers: [BenchServiceC],
})
class LeafModule { }

@Module({
  imports: [LeafModule],
  providers: [BenchServiceB],
})
class MiddleModule { }

@Module({
  imports: [MiddleModule],
  providers: [BenchService],
})
class RootModule { }

@Module({ providers: [] })
class DynamicConfigModule {
  static forRoot(value: string) {
    return {
      module: DynamicConfigModule,
      providers: [
        { provide: Symbol('config'), useValue: { value } },
      ],
    }
  }
}

@Module({ providers: [BenchService] })
class LifecycleModule implements OnInitialize {
  onInitialize(_context: ModuleContext) {
    // no-op for benchmarking
  }
}

// No-op logger to avoid measuring logging overhead
const noopLogger = {
  info: () => null,
  warn: () => null,
  error: () => null,
  debug: () => null,
} as unknown as LoggerService

const mockCtx = {
  waitUntil: () => null,
  passThroughOnException: () => null,
} as unknown as ExecutionContext

function createFreshContainer(): Container {
  return new Container({
    env: {} as StratalEnv,
    ctx: mockCtx,
    container: tsyringeRootContainer.createChildContainer(),
  })
}

function createRegistry(): ModuleRegistry {
  return new ModuleRegistry(createFreshContainer(), noopLogger)
}

describe('ModuleRegistry - Registration', () => {
  bench('register single module', () => {
    const registry = createRegistry()
    registry.register(SingleModule)
  })

  bench('register 3-level module tree', () => {
    const registry = createRegistry()
    registry.register(RootModule)
  })

  bench('register dynamic module (forRoot)', () => {
    const registry = createRegistry()
    registry.register(DynamicConfigModule.forRoot('bench-value'))
  })
})

describe('ModuleRegistry - Initialization', () => {
  bench('initialize with lifecycle hooks', async () => {
    const registry = createRegistry()
    registry.register(LifecycleModule)
    await registry.initialize()
  })
})

describe('ModuleRegistry - Collection', () => {
  bench('getAllControllers', () => {
    const registry = createRegistry()
    registry.register(RootModule)
    registry.getAllControllers()
  })

  bench('getAllConsumers', () => {
    const registry = createRegistry()
    registry.register(RootModule)
    registry.getAllConsumers()
  })

  bench('getAllJobs', () => {
    const registry = createRegistry()
    registry.register(RootModule)
    registry.getAllJobs()
  })
})
