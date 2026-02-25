import { beforeEach, describe, expect, it } from 'vitest'
import type { IController } from '../../router/controller'
import type { Middleware } from '../../router/middleware.interface'
import type { Constructor } from '../../types'
import { MiddlewareConsumerImpl, createMiddlewareConsumer } from '../middleware-consumer'

// Test middleware classes
class AuthMiddleware {
  async handle() {
    // noop
  }
}

class LoggingMiddleware {
  async handle() {
    // noop
  }
}

class RateLimitMiddleware {
  async handle() {
    // noop
  }
}

// Test controller classes
class Controller1 {}
class Controller2 {}

describe('MiddlewareConsumer', () => {
  let consumer: MiddlewareConsumerImpl

  beforeEach(() => {
    consumer = new MiddlewareConsumerImpl()
  })

  describe('apply().forRoutes()', () => {
    it('should create entry with global route for single middleware', () => {
      consumer.apply(AuthMiddleware as Constructor<Middleware>).forRoutes('*')

      const entries = consumer.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].middlewares).toEqual([AuthMiddleware])
      expect(entries[0].routes).toEqual(['*'])
      expect(entries[0].excludes).toEqual([])
    })

    it('should create entry with multiple middlewares', () => {
      consumer
        .apply(
          AuthMiddleware as Constructor<Middleware>,
          LoggingMiddleware as Constructor<Middleware>
        )
        .forRoutes('*')

      const entries = consumer.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].middlewares).toEqual([AuthMiddleware, LoggingMiddleware])
    })
  })

  describe('exclude().forRoutes()', () => {
    it('should create entry with string exclusion', () => {
      consumer
        .apply(AuthMiddleware as Constructor<Middleware>)
        .exclude('/health')
        .forRoutes('*')

      const entries = consumer.getEntries()
      expect(entries[0].excludes).toEqual([{ path: '/health' }])
    })

    it('should handle mixed exclude formats', () => {
      consumer
        .apply(AuthMiddleware as Constructor<Middleware>)
        .exclude('/health', { path: '/api', method: 'get' })
        .forRoutes('*')

      const entries = consumer.getEntries()
      expect(entries[0].excludes).toEqual([
        { path: '/health' },
        { path: '/api', method: 'get' },
      ])
    })
  })

  describe('forRoutes() targets', () => {
    it('should store controller targets', () => {
      consumer
        .apply(AuthMiddleware as Constructor<Middleware>)
        .forRoutes(Controller1 as Constructor<IController>, Controller2 as Constructor<IController>)

      const entries = consumer.getEntries()
      expect(entries[0].routes).toEqual([Controller1, Controller2])
    })

    it('should store route info objects', () => {
      consumer
        .apply(AuthMiddleware as Constructor<Middleware>)
        .forRoutes({ path: '/api/v1', method: 'post' })

      const entries = consumer.getEntries()
      expect(entries[0].routes).toEqual([{ path: '/api/v1', method: 'post' }])
    })
  })

  describe('multiple chains', () => {
    it('should create separate entries for multiple apply().forRoutes() chains', () => {
      consumer.apply(AuthMiddleware as Constructor<Middleware>).forRoutes('*')
      consumer.apply(RateLimitMiddleware as Constructor<Middleware>).forRoutes({ path: '/api', method: 'post' })

      const entries = consumer.getEntries()
      expect(entries).toHaveLength(2)
      expect(entries[0].middlewares).toEqual([AuthMiddleware])
      expect(entries[1].middlewares).toEqual([RateLimitMiddleware])
    })
  })

  describe('getEntries()', () => {
    it('should return all configured entries', () => {
      consumer.apply(AuthMiddleware as Constructor<Middleware>).forRoutes('*')
      consumer.apply(LoggingMiddleware as Constructor<Middleware>).forRoutes(Controller1 as Constructor<IController>)

      expect(consumer.getEntries()).toHaveLength(2)
    })

    it('should return empty array when no entries configured', () => {
      expect(consumer.getEntries()).toEqual([])
    })
  })

  describe('createMiddlewareConsumer()', () => {
    it('should return a new consumer instance', () => {
      const instance = createMiddlewareConsumer()
      expect(instance).toBeDefined()
      expect(instance.getEntries()).toEqual([])
    })
  })
})
