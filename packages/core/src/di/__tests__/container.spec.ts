import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouterContext } from '../../router/router-context'
import { Container } from '../container'
import { ContainerError } from '../container.error'
import { inject, Request, Transient } from '../decorators'
import { lazy } from '../lazy'
import { CONTAINER_TOKEN, DI_TOKENS } from '../tokens'

// Test services
@Transient()
class TestService {
  getValue() {
    return 'test-value'
  }
}

@Transient()
class AnotherService {
  getName() {
    return 'another'
  }
}

const REQUEST_SCOPED_TOKEN = Symbol('RequestScopedToken')

@Request(REQUEST_SCOPED_TOKEN)
class RequestScopedService {
  getValue() {
    return 'request-scoped'
  }
}

const TEST_TOKEN = Symbol('TestToken')
const ALIAS_TOKEN = Symbol('AliasToken')

describe('Container', () => {
  let container: Container

  beforeEach(() => {
    vi.clearAllMocks()

    container = new Container()
  })

  describe('register() and resolve()', () => {
    it('should register and resolve a service class', () => {
      container.register(TestService)
      const instance = container.resolve(TestService)

      expect(instance).toBeInstanceOf(TestService)
      expect(instance.getValue()).toBe('test-value')
    })

    it('should register with explicit token and resolve', () => {
      container.register(TEST_TOKEN, TestService)
      const instance = container.resolve<TestService>(TEST_TOKEN)

      expect(instance).toBeInstanceOf(TestService)
      expect(instance.getValue()).toBe('test-value')
    })
  })

  describe('registerSingleton()', () => {
    it('should return same instance on multiple resolves', () => {
      container.registerSingleton(TestService)
      const first = container.resolve(TestService)
      const second = container.resolve(TestService)

      expect(first).toBe(second)
    })

    it('should work with explicit token', () => {
      container.registerSingleton(TEST_TOKEN, TestService)
      const first = container.resolve<TestService>(TEST_TOKEN)
      const second = container.resolve<TestService>(TEST_TOKEN)

      expect(first).toBe(second)
    })
  })

  describe('registerValue()', () => {
    it('should resolve with exact registered value', () => {
      const value = { custom: 'data', count: 42 }
      container.registerValue(TEST_TOKEN, value)
      const resolved = container.resolve<typeof value>(TEST_TOKEN)

      expect(resolved).toBe(value)
      expect(resolved.count).toBe(42)
    })

    it('should not destroy other cached request-scoped services', () => {
      const UNRELATED_TOKEN = Symbol('UnrelatedToken')

      container.register(REQUEST_SCOPED_TOKEN, RequestScopedService)
      const reqContainer = new Container({ parent: container, isRequestScoped: true })

      const first = reqContainer.resolve<RequestScopedService>(REQUEST_SCOPED_TOKEN)
      reqContainer.registerValue(UNRELATED_TOKEN, { unrelated: true })
      const second = reqContainer.resolve<RequestScopedService>(REQUEST_SCOPED_TOKEN)

      expect(second).toBe(first)
    })

    it('should invalidate only its own token in request cache', () => {
      const TOKEN_A = Symbol('TokenA')
      const TOKEN_B = Symbol('TokenB')

      const reqContainer = new Container({ parent: container, isRequestScoped: true })
      reqContainer.registerValue(TOKEN_A, 'original-a')
      reqContainer.registerValue(TOKEN_B, 'original-b')

      expect(reqContainer.resolve(TOKEN_A)).toBe('original-a')
      expect(reqContainer.resolve(TOKEN_B)).toBe('original-b')

      reqContainer.registerValue(TOKEN_A, 'updated-a')

      expect(reqContainer.resolve(TOKEN_A)).toBe('updated-a')
      expect(reqContainer.resolve(TOKEN_B)).toBe('original-b')
    })
  })

  describe('registerFactory()', () => {
    it('should call factory and return result', () => {
      const factory = vi.fn().mockReturnValue({ created: true })
      container.registerFactory(TEST_TOKEN, factory)
      const result = container.resolve<{ created: boolean }>(TEST_TOKEN)

      expect(result).toEqual({ created: true })
    })
  })

  describe('registerExisting()', () => {
    it('should resolve alias to same instance as target', () => {
      container.registerSingleton(TEST_TOKEN, TestService)
      container.registerExisting(ALIAS_TOKEN, TEST_TOKEN)

      const original = container.resolve<TestService>(TEST_TOKEN)
      const aliased = container.resolve<TestService>(ALIAS_TOKEN)

      expect(original).toBe(aliased)
    })
  })

  describe('isRegistered()', () => {
    it('should return true after registration', () => {
      container.registerValue(TEST_TOKEN, 'value')
      expect(container.isRegistered(TEST_TOKEN)).toBe(true)
    })

    it('should return false before registration', () => {
      const unknownToken = Symbol('unknown')
      expect(container.isRegistered(unknownToken)).toBe(false)
    })
  })

  describe('extend()', () => {
    it('should replace registered instance with decorated version', () => {
      container.registerValue(TEST_TOKEN, { value: 'original' })
      container.extend(TEST_TOKEN, (instance: any) => ({
        ...instance,
        decorated: true,
      }))

      const result = container.resolve<any>(TEST_TOKEN)
      expect(result.value).toBe('original')
      expect(result.decorated).toBe(true)
    })
  })

  describe('when()', () => {
    it('should resolve A when predicate is true, B when false', () => {
      let flag = true

      container.registerSingleton(TestService)
      container.registerSingleton(AnotherService)

      container
        .when(() => flag)
        .use(TEST_TOKEN)
        .give(TestService)
        .otherwise(AnotherService)

      const resultA = container.resolve<TestService>(TEST_TOKEN)
      expect(resultA).toBeInstanceOf(TestService)

      // Change flag for next resolution
      flag = false
      const resultB = container.resolve<AnotherService>(TEST_TOKEN)
      expect(resultB).toBeInstanceOf(AnotherService)
    })
  })

  describe('constructor token registration', () => {
    it('should register CONTAINER_TOKEN for global container', () => {
      expect(container.isRegistered(CONTAINER_TOKEN)).toBe(true)
    })
  })

  describe('request scope restrictions', () => {
    it('should throw ContainerError for runInRequestScope on request-scoped container', async () => {
      const reqContainer = new Container({
        parent: container,
        isRequestScoped: true,
      })

      await expect(
        reqContainer.runInRequestScope({} as unknown as RouterContext, async () => {
          // noop
        })
      ).rejects.toThrow(ContainerError)
    })

    it('should throw ContainerError for createRequestScope on request-scoped container', () => {
      const reqContainer = new Container({
        parent: container,
        isRequestScoped: true,
      })

      expect(() => reqContainer.createRequestScope({} as unknown as RouterContext)).toThrow(
        ContainerError
      )
    })
  })

  describe('runInRequestScope()', () => {
    it('should pass requestContainer to callback', async () => {
      // Need to register logger tokens for Container.dispose() to work
      container.registerValue(DI_TOKENS.ExecutionContext, { waitUntil: vi.fn() })

      const mockRouterContext = {
        getLocale: () => 'en',
        setLocale: () => {
          // no op
        },
        getContainer: () => container,
      } as unknown as RouterContext

      let receivedContainer: Container | undefined

      await container.runInRequestScope(mockRouterContext, (reqContainer) => {
        receivedContainer = reqContainer
      })

      expect(receivedContainer).toBeDefined()
      expect(receivedContainer).not.toBe(container)
    })
  })

  describe('circular dependency detection', () => {
    it('should throw a clear error instead of overflowing the stack', () => {
      const A_TOKEN = Symbol('A')
      const B_TOKEN = Symbol('B')

      @Transient(A_TOKEN)
      class A {
        constructor(@inject(B_TOKEN) public b: unknown) {}
      }

      @Transient(B_TOKEN)
      class B {
        constructor(@inject(A_TOKEN) public a: unknown) {}
      }

      container.register(A_TOKEN, A)
      container.register(B_TOKEN, B)

      expect(() => container.resolve(A_TOKEN)).toThrow(ContainerError)
      expect(() => container.resolve(A_TOKEN)).toThrow(/circular dependency/i)
    })

    it('should resolve again cleanly after a circular-dependency error (stack is unwound)', () => {
      container.register(TestService)
      // A failed resolution must not leave the resolution stack polluted.
      expect(container.resolve(TestService)).toBeInstanceOf(TestService)
    })
  })

  describe('captive dependency', () => {
    it('should throw when a singleton depends on a request-scoped provider', async () => {
      const SINGLETON_TOKEN = Symbol('CaptiveSingleton')

      @Request(REQUEST_SCOPED_TOKEN)
      class ReqService {}

      // A singleton that injects a @Request provider would otherwise capture one
      // request's instance forever. Resolving it (even inside a request) must
      // fail rather than leak.
      class CaptiveSingleton {
        constructor(@inject(REQUEST_SCOPED_TOKEN) public req: ReqService) {}
      }

      container.registerSingleton(SINGLETON_TOKEN, CaptiveSingleton)
      container.register(REQUEST_SCOPED_TOKEN, ReqService)

      const routerContext = { getContainer: () => container } as unknown as RouterContext

      await container.runInRequestScope(routerContext, (req) => {
        expect(() => req.resolve(SINGLETON_TOKEN)).toThrow(/request-scoped/i)
      })
    })
  })

  describe('tryResolve()', () => {
    it('should return undefined for an unregistered token', () => {
      expect(container.tryResolve(Symbol('missing'))).toBeUndefined()
    })

    it('should propagate a construction error instead of masking it as undefined', () => {
      const THROWS_TOKEN = Symbol('Throws')

      @Transient(THROWS_TOKEN)
      class Throws {
        constructor() {
          throw new Error('boom')
        }
      }

      container.register(THROWS_TOKEN, Throws)
      // The provider IS registered; a failure constructing it is a real error.
      expect(() => container.tryResolve(THROWS_TOKEN)).toThrow('boom')
    })

    it('should return undefined for a request-scoped provider outside a request scope', () => {
      container.register(REQUEST_SCOPED_TOKEN, RequestScopedService)

      // Optional request-scoped dependency outside a request = absent, not an
      // error — mirrors `@inject(..., { isOptional: true })` semantics.
      expect(container.tryResolve(REQUEST_SCOPED_TOKEN)).toBeUndefined()
    })

    it('should resolve a request-scoped provider inside a request scope', async () => {
      container.register(REQUEST_SCOPED_TOKEN, RequestScopedService)
      const routerContext = { getContainer: () => container } as unknown as RouterContext

      await container.runInRequestScope(routerContext, (req) => {
        expect(req.tryResolve(REQUEST_SCOPED_TOKEN)).toBeInstanceOf(RequestScopedService)
      })
    })

    it('should return undefined for a lazily-registered request-scoped provider outside a request scope', () => {
      container.register(REQUEST_SCOPED_TOKEN, lazy(() => RequestScopedService))

      // Lazy registrations derive their scope from decorator metadata at
      // resolution time — tryResolve must see the same scope and stay silent.
      expect(container.tryResolve(REQUEST_SCOPED_TOKEN)).toBeUndefined()
    })

    it('should return undefined for an alias to a request-scoped provider outside a request scope', () => {
      container.register(REQUEST_SCOPED_TOKEN, RequestScopedService)
      container.registerExisting(ALIAS_TOKEN, REQUEST_SCOPED_TOKEN)

      expect(container.tryResolve(ALIAS_TOKEN)).toBeUndefined()
    })

    it('should return undefined for an unregistered request-scoped class token outside a request scope', () => {
      // Auto-resolvable constructor: scope comes from decorator metadata, not a
      // registration — must behave the same on the first call as on later ones.
      expect(container.tryResolve(RequestScopedService)).toBeUndefined()
    })
  })

  describe('dispose()', () => {
    it('should invoke dispose hooks on cached singletons, preferring async > sync > method', async () => {
      const calls: string[] = []

      class AsyncDisposableService {
        [Symbol.asyncDispose]() {
          calls.push('async')
          return Promise.resolve()
        }
        [Symbol.dispose]() { calls.push('sync') }
        dispose() { calls.push('method') }
      }
      class SyncDisposableService {
        [Symbol.dispose]() { calls.push('sync-only') }
      }
      class MethodDisposableService {
        dispose() { calls.push('method-only') }
      }

      container.registerSingleton(AsyncDisposableService)
      container.registerSingleton(SyncDisposableService)
      container.registerSingleton(MethodDisposableService)
      container.resolve(AsyncDisposableService)
      container.resolve(SyncDisposableService)
      container.resolve(MethodDisposableService)

      await container.dispose()

      expect(calls.sort()).toEqual(['async', 'method-only', 'sync-only'])
    })

    it('should dispose instances in reverse creation order (LIFO)', async () => {
      const order: string[] = []

      class FirstService {
        dispose() { order.push('first') }
      }
      class SecondService {
        dispose() { order.push('second') }
      }
      class ThirdService {
        dispose() { order.push('third') }
      }

      container.registerSingleton(FirstService)
      container.registerSingleton(SecondService)
      container.registerSingleton(ThirdService)
      container.resolve(FirstService)
      container.resolve(SecondService)
      container.resolve(ThirdService)

      await container.dispose()

      // A disposer may still use dependencies constructed before its own
      // instance, so teardown unwinds construction order.
      expect(order).toEqual(['third', 'second', 'first'])
    })

    it('should not dispose singletons that were never resolved', async () => {
      const disposeSpy = vi.fn()
      class NeverResolvedService {
        dispose() { disposeSpy() }
      }

      container.registerSingleton(NeverResolvedService)

      await container.dispose()

      expect(disposeSpy).not.toHaveBeenCalled()
    })

    it('should continue past a throwing disposer and log the failure', async () => {
      const disposed: string[] = []
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* silence */ })

      class ThrowingService {
        dispose() {
          disposed.push('throwing')
          throw new Error('boom')
        }
      }
      class HealthyService {
        dispose() { disposed.push('healthy') }
      }

      container.registerSingleton(ThrowingService)
      container.registerSingleton(HealthyService)
      container.resolve(ThrowingService)
      container.resolve(HealthyService)

      await container.dispose()

      // LIFO disposal: HealthyService was created last, so it unwinds first.
      expect(disposed).toEqual(['healthy', 'throwing'])
      expect(consoleError).toHaveBeenCalledOnce()
      consoleError.mockRestore()
    })

    it('should not dispose value registrations (instances the container does not own)', async () => {
      const disposeSpy = vi.fn()
      container.registerValue(TEST_TOKEN, { dispose: disposeSpy })
      container.resolve(TEST_TOKEN)

      await container.dispose()

      expect(disposeSpy).not.toHaveBeenCalled()
    })

    it('should clear all registrations and caches', async () => {
      // Symbol token: class tokens auto-resolve from decorator metadata even
      // without a registration, so they can't prove the maps were cleared.
      container.registerSingleton(TEST_TOKEN, TestService)
      container.resolve(TEST_TOKEN)

      await container.dispose()

      expect(container.tryResolve(TEST_TOKEN)).toBeUndefined()
    })
  })

})
