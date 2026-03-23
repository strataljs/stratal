import { describe, expect, it } from 'vitest'
import {
  createCliExceptionContext,
  createCronExceptionContext,
  createHttpExceptionContext,
  createQueueExceptionContext,
} from '../exception-context'

describe('ExceptionContext', () => {
  describe('createHttpExceptionContext', () => {
    it('should create an HTTP context with type "http"', () => {
      const mockHonoContext = { req: { method: 'GET' } } as never
      const ctx = createHttpExceptionContext(mockHonoContext)

      expect(ctx.type).toBe('http')
      expect(ctx.ctx).toBeDefined()
    })
  })

  describe('createQueueExceptionContext', () => {
    it('should create a queue context with type and queueName', () => {
      const ctx = createQueueExceptionContext('my-queue')

      expect(ctx.type).toBe('queue')
      expect(ctx.queueName).toBe('my-queue')
    })
  })

  describe('createCronExceptionContext', () => {
    it('should create a cron context with type "cron"', () => {
      const ctx = createCronExceptionContext()

      expect(ctx.type).toBe('cron')
    })
  })

  describe('createCliExceptionContext', () => {
    it('should create a CLI context with type and commandName', () => {
      const ctx = createCliExceptionContext('db:seed')

      expect(ctx.type).toBe('cli')
      expect(ctx.commandName).toBe('db:seed')
    })
  })

  describe('discriminated union narrowing', () => {
    it('should narrow to HTTP context', () => {
      const mockHonoContext = { req: { method: 'GET' } } as never
      const ctx = createHttpExceptionContext(mockHonoContext)

      expect(ctx.ctx).toBeDefined()
    })

    it('should narrow to queue context', () => {
      const ctx = createQueueExceptionContext('emails')

      expect(ctx.queueName).toBe('emails')
    })

    it('should narrow to CLI context', () => {
      const ctx = createCliExceptionContext('migrate')

      expect(ctx.commandName).toBe('migrate')
    })
  })
})
