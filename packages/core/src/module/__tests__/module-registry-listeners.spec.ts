import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { Container } from '../../di/container'
import { Transient } from '../../di/decorators'
import { isListener, Listener } from '../../events'
import type { LoggerService } from '../../logger/services/logger.service'
import { Module } from '../module.decorator'
import { ModuleRegistry } from '../module-registry'

describe('ModuleRegistry - Listener Detection', () => {
  let container: Container
  let mockLogger: DeepMocked<LoggerService>
  let registry: ModuleRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    container = new Container()
    mockLogger = createMock<LoggerService>()
    registry = new ModuleRegistry(container, mockLogger)
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
        { provide: LISTENER_TOKEN, useClass: MyListener },
      ],
    })
    class TestModule {}

    registry.register(TestModule)

    expect(registry.getAllListeners()).toContain(MyListener)
  })

  it('should not collect non-listener providers', () => {
    @Transient()
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

  it('should register listener with its declared (transient) scope, not as a singleton', () => {
    @Listener()
    class MyListener {
      handle() { return 'handled' }
    }

    @Module({ providers: [MyListener] })
    class TestModule {}

    registry.register(TestModule)

    // `@Listener()` applies `@Transient()`; the registry honors it (no forced
    // singleton) so listeners resolve fresh per event from the request scope.
    const instance1 = container.resolve(MyListener)
    const instance2 = container.resolve(MyListener)
    expect(instance1).not.toBe(instance2)
  })
})
