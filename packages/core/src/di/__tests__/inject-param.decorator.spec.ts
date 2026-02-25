import { describe, expect, it } from 'vitest'
import {
  InjectParam,
  getMethodInjections,
  INJECT_PARAM_METADATA_KEY,
} from '../decorators/inject-param.decorator'

// Test tokens
const TOKEN_A = Symbol('TokenA')
const TOKEN_B = Symbol('TokenB')

class ServiceA {}
class ServiceB {}

describe('InjectParam decorator', () => {
  describe('metadata storage', () => {
    it('should store injection metadata on method', () => {
      class TestController {
        testMethod(
          _ctx: unknown,
          @InjectParam(TOKEN_A) _serviceA: unknown
        ) {
          // noop
        }
      }

      const metadata = Reflect.getMetadata(
        INJECT_PARAM_METADATA_KEY,
        TestController.prototype,
        'testMethod'
      )

      expect(metadata).toBeDefined()
      expect(metadata).toHaveLength(1)
      expect(metadata[0]).toEqual({ index: 1, token: TOKEN_A })
    })

    it('should store multiple injections on same method', () => {
      class TestController {
        testMethod(
          _ctx: unknown,
          @InjectParam(TOKEN_A) _serviceA: unknown,
          @InjectParam(TOKEN_B) _serviceB: unknown
        ) {
          // noop
        }
      }

      const metadata = Reflect.getMetadata(
        INJECT_PARAM_METADATA_KEY,
        TestController.prototype,
        'testMethod'
      )

      expect(metadata).toHaveLength(2)
      // Note: Decorators are applied in reverse order
      expect(metadata).toContainEqual({ index: 1, token: TOKEN_A })
      expect(metadata).toContainEqual({ index: 2, token: TOKEN_B })
    })

    it('should support class tokens', () => {
      class TestController {
        testMethod(
          _ctx: unknown,
          @InjectParam(ServiceA) _serviceA: ServiceA
        ) {
          // noop
        }
      }

      const metadata = Reflect.getMetadata(
        INJECT_PARAM_METADATA_KEY,
        TestController.prototype,
        'testMethod'
      )

      expect(metadata).toHaveLength(1)
      expect(metadata[0].token).toBe(ServiceA)
    })

    it('should not interfere between different methods', () => {
      class TestController {
        methodA(
          _ctx: unknown,
          @InjectParam(TOKEN_A) _service: unknown
        ) {
          // noop
        }

        methodB(
          _ctx: unknown,
          @InjectParam(TOKEN_B) _service: unknown
        ) {
          // noop
        }
      }

      const metadataA = Reflect.getMetadata(
        INJECT_PARAM_METADATA_KEY,
        TestController.prototype,
        'methodA'
      )

      const metadataB = Reflect.getMetadata(
        INJECT_PARAM_METADATA_KEY,
        TestController.prototype,
        'methodB'
      )

      expect(metadataA).toHaveLength(1)
      expect(metadataA[0].token).toBe(TOKEN_A)

      expect(metadataB).toHaveLength(1)
      expect(metadataB[0].token).toBe(TOKEN_B)
    })
  })

  describe('getMethodInjections', () => {
    it('should return empty array for non-decorated method', () => {
      class TestController {
        testMethod(_ctx: unknown) {
          // noop
        }
      }

      const injections = getMethodInjections(TestController.prototype, 'testMethod')

      expect(injections).toEqual([])
    })

    it('should return injections sorted by parameter index', () => {
      class TestController {
        testMethod(
          _ctx: unknown,
          @InjectParam(TOKEN_A) _serviceA: unknown,
          @InjectParam(TOKEN_B) _serviceB: unknown
        ) {
          // noop
        }
      }

      const injections = getMethodInjections(TestController.prototype, 'testMethod')

      expect(injections).toHaveLength(2)
      expect(injections[0].index).toBe(1)
      expect(injections[0].token).toBe(TOKEN_A)
      expect(injections[1].index).toBe(2)
      expect(injections[1].token).toBe(TOKEN_B)
    })

    it('should return empty array for non-existent method', () => {
      class TestController {
        existingMethod() {
          // noop
        }
      }

      const injections = getMethodInjections(TestController.prototype, 'nonExistentMethod')

      expect(injections).toEqual([])
    })

    it('should handle mixed class and symbol tokens', () => {
      class TestController {
        testMethod(
          _ctx: unknown,
          @InjectParam(ServiceA) _serviceA: ServiceA,
          @InjectParam(TOKEN_B) _serviceB: unknown,
          @InjectParam(ServiceB) _serviceB2: ServiceB
        ) {
          // noop
        }
      }

      const injections = getMethodInjections(TestController.prototype, 'testMethod')

      expect(injections).toHaveLength(3)
      expect(injections[0].token).toBe(ServiceA)
      expect(injections[1].token).toBe(TOKEN_B)
      expect(injections[2].token).toBe(ServiceB)
    })
  })

  describe('error handling', () => {
    it('should throw when used on constructor parameter', () => {
      expect(() => {
        // This is intentionally testing invalid usage
        // @ts-expect-error - Testing runtime error for constructor usage
        @InjectParam(TOKEN_A)
        class TestClass {
        }
        return TestClass
      }).toThrow('@InjectParam can only be used on method parameters')
    })
  })
})
