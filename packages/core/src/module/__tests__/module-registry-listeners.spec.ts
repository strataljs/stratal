import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { container as tsyringeRootContainer, injectable } from 'tsyringe'
import type { DependencyContainer } from 'tsyringe'
import type { StratalEnv } from '../../env'
import { Container } from '../../di/container'
import { Scope } from '../../di/types'
import { isListener, Listener } from '../../events'
import type { LoggerService } from '../../logger/services/logger.service'
import { Module } from '../module.decorator'
import { ModuleRegistry } from '../module-registry'

describe('ModuleRegistry - Listener Detection', () => {
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

  it('should collect bare class listeners from providers', () => {
    @Listener()
    class MyListener {
      handle() { return 'handled' }
    }

    @Module({ providers: [MyListener] })
    class TestModule {}

    registry.register(TestModule)

    expect(registry.getAllListeners()).toContain(MyListener)
    expect(isListener(MyListener)).toBe(true)
  })

  it('should collect ClassProvider listeners', () => {
    const LISTENER_TOKEN = Symbol('ListenerToken')

    @Listener()
    class MyListener {
      handle() { return 'handled' }
    }

    @Module({
      providers: [
        { provide: LISTENER_TOKEN, useClass: MyListener, scope: Scope.Singleton },
      ],
    })
    class TestModule {}

    registry.register(TestModule)

    expect(registry.getAllListeners()).toContain(MyListener)
  })

  it('should not collect non-listener providers', () => {
    @injectable()
    class RegularService {
      getValue() { return 'value' }
    }

    @Module({ providers: [RegularService] })
    class TestModule {}

    registry.register(TestModule)

    expect(registry.getAllListeners()).toHaveLength(0)
  })

  it('should not collect value/factory/existing providers as listeners', () => {
    const TOKEN = Symbol('Token')

    @Module({
      providers: [
        { provide: TOKEN, useValue: { foo: 'bar' } },
      ],
    })
    class TestModule {}

    registry.register(TestModule)

    expect(registry.getAllListeners()).toHaveLength(0)
  })

  it('should re-register listener as singleton', () => {
    @Listener()
    class MyListener {
      handle() { return 'handled' }
    }

    @Module({ providers: [MyListener] })
    class TestModule {}

    registry.register(TestModule)

    // Resolving twice should return the same instance
    const instance1 = container.resolve(MyListener)
    const instance2 = container.resolve(MyListener)
    expect(instance1).toBe(instance2)
  })
})
