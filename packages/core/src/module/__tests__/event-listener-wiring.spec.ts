import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { Container } from '../../di/container'
import { inject, Transient } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import { Listener, On, getListenerHandlers } from '../../events'
import type { LoggerService } from '../../logger/services/logger.service'
import { Module } from '../module.decorator'
import { ModuleRegistry } from '../module-registry'

describe('Event Listener Auto-Wiring (Application-level)', () => {
  let container: Container
  let mockLogger: DeepMocked<LoggerService>
  let registry: ModuleRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    container = new Container()
    mockLogger = createMock<LoggerService>()
    registry = new ModuleRegistry(container, mockLogger)
  })

  it('should wire listener handlers with EventRegistry', () => {
    const onSpy = vi.fn()

    // Mock EventRegistry
    const mockEventRegistry = { on: onSpy }
    container.registerValue(DI_TOKENS.EventRegistry, mockEventRegistry)

    // Create a listener
    @Listener()
    class UserCreatedListener {
      @On('after.User.create')
      async sendWelcomeEmail() { /* noop */ }

      @On('after.User.delete', { priority: 10 })
      async cleanup() { /* noop */ }
    }

    @Module({ providers: [UserCreatedListener] })
    class TestModule {}

    registry.register(TestModule)

    // Simulate what Application.registerEventListeners() does
    const listeners = registry.getAllListeners()
    expect(listeners).toHaveLength(1)

    const eventRegistry = container.resolve<{ on: typeof onSpy }>(DI_TOKENS.EventRegistry)

    for (const ListenerClass of listeners) {
      const instance = container.resolve(ListenerClass) as Record<string, (...args: unknown[]) => unknown>
      const handlers = getListenerHandlers(ListenerClass)

      for (const { methodName, event, options } of handlers) {
        eventRegistry.on(event, instance[methodName].bind(instance), options)
      }
    }

    expect(onSpy).toHaveBeenCalledTimes(2)
    expect(onSpy).toHaveBeenCalledWith('after.User.create', expect.any(Function), undefined)
    expect(onSpy).toHaveBeenCalledWith('after.User.delete', expect.any(Function), { priority: 10 })
  })

  it('should collect listeners even without EventRegistry in container', () => {
    @Listener()
    class MyListener {
      @On('after.User.create')
      async handle() { /* noop */ }
    }

    @Module({ providers: [MyListener] })
    class TestModule {}

    registry.register(TestModule)

    // ModuleRegistry collects listeners regardless of EventRegistry
    expect(registry.getAllListeners()).toHaveLength(1)
  })

  it('should register listeners as transient (fresh instance per event resolution)', () => {
    const mockEventRegistry = { on: vi.fn() }
    container.registerValue(DI_TOKENS.EventRegistry, mockEventRegistry)

    @Listener()
    class AuditListener {
      @On('after.User.create')
      async onCreate() { /* noop */ }

      @On('after.User.update')
      async onUpdate() { /* noop */ }
    }

    @Module({ providers: [AuditListener] })
    class TestModule {}

    registry.register(TestModule)

    // Listeners are transient, not singletons — they are resolved fresh per event
    // from the emitting request scope, so request-scoped dependencies bind to the
    // emitting request instead of being frozen at boot.
    const instance1 = container.resolve(AuditListener)
    const instance2 = container.resolve(AuditListener)
    expect(instance1).not.toBe(instance2)
  })

  it('should correctly bind handler methods to the listener instance', async () => {
    const handleSpy = vi.fn()

    @Listener()
    class SpyListener {
      @On('after.User.create')
      handle() {
        handleSpy(this)
      }
    }

    @Module({ providers: [SpyListener] })
    class TestModule {}

    registry.register(TestModule)

    const listeners = registry.getAllListeners()
    const instance = container.resolve(listeners[0]) as Record<string, (...args: unknown[]) => unknown>
    const handlers = getListenerHandlers(listeners[0])

    // Call the bound handler
    const boundHandler = instance[handlers[0].methodName].bind(instance)
    await boundHandler()

    // Verify `this` context is correct
    expect(handleSpy).toHaveBeenCalledWith(instance)
  })

  it('should handle listener with injected dependencies', () => {
    const SERVICE_TOKEN = Symbol('TestService')

    @Transient()
    class TestService {
      getValue() { return 'injected' }
    }

    container.register(SERVICE_TOKEN, TestService)

    @Listener()
    class DependentListener {
      constructor(@inject(SERVICE_TOKEN) readonly service: TestService) {}

      @On('after.User.create')
      async handle() { /* noop */ }
    }

    @Module({ providers: [DependentListener] })
    class TestModule {}

    registry.register(TestModule)

    const instance = container.resolve(DependentListener)
    expect(instance.service).toBeInstanceOf(TestService)
    expect(instance.service.getValue()).toBe('injected')
  })
})
