import type { DependencyContainer } from 'tsyringe'
import { injectable, Lifecycle, container as tsyringeRootContainer } from 'tsyringe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouterContext } from '../../router/router-context'
import { Container } from '../container'
import { RequestScopeOperationNotAllowedError } from '../errors/request-scope-operation-not-allowed.error'
import { CONTAINER_TOKEN, DI_TOKENS } from '../tokens'
import { Scope } from '../types'

// Test services
@injectable()
class TestService {
  getValue() {
    return 'test-value'
  }
}

@injectable()
class AnotherService {
  getName() {
    return 'another'
  }
}

const TEST_TOKEN = Symbol('TestToken')
const ALIAS_TOKEN = Symbol('AliasToken')

describe('Container', () => {
  let childContainer: DependencyContainer
  let container: Container

  beforeEach(() => {
    vi.clearAllMocks()
    childContainer = tsyringeRootContainer.createChildContainer()

    container = new Container({
      container: childContainer,
    })
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

    it('should NOT register CONTAINER_TOKEN for request-scoped container', () => {
      const reqChildContainer = tsyringeRootContainer.createChildContainer()
      const _reqContainer = new Container({
        container: reqChildContainer,
        isRequestScoped: true,
      })

      // Should not be registered in this specific container
      expect(reqChildContainer.isRegistered(CONTAINER_TOKEN, true)).toBe(false)
    })
  })

  describe('request scope restrictions', () => {
    it('should throw RequestScopeOperationNotAllowedError for runInRequestScope on request-scoped container', async () => {
      const reqChildContainer = tsyringeRootContainer.createChildContainer()
      const reqContainer = new Container({
        container: reqChildContainer,
        isRequestScoped: true,
      })

      await expect(
        reqContainer.runInRequestScope({} as unknown as RouterContext, async () => {
          // noop
        })
      ).rejects.toThrow(RequestScopeOperationNotAllowedError)
    })

    it('should throw RequestScopeOperationNotAllowedError for createRequestScope on request-scoped container', () => {
      const reqChildContainer = tsyringeRootContainer.createChildContainer()
      const reqContainer = new Container({
        container: reqChildContainer,
        isRequestScoped: true,
      })

      expect(() => reqContainer.createRequestScope({} as unknown as RouterContext)).toThrow(
        RequestScopeOperationNotAllowedError
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

  describe('Scope enum', () => {
    it('should map Scope.Transient to Lifecycle.Transient', () => {
      expect(Scope.Transient).toBe(Lifecycle.Transient)
    })

    it('should map Scope.Singleton to Lifecycle.Singleton', () => {
      expect(Scope.Singleton).toBe(Lifecycle.Singleton)
    })

    it('should map Scope.Request to Lifecycle.ContainerScoped', () => {
      expect(Scope.Request).toBe(Lifecycle.ContainerScoped)
    })
  })
})
