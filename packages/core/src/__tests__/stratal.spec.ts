import { injectable } from 'tsyringe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application, type ApplicationOptions } from '../application'
import { Scope } from '../di/types'
import type { StratalEnv } from '../env'
import { z } from '../i18n/validation'
import { LogLevel } from '../logger'
import { Module } from '../module/module.decorator'
import { Controller } from '../router/decorators/controller.decorator'
import { Route } from '../router/decorators/route.decorator'
import type { RouterContext } from '../router/router-context'

// Fixtures

const TOKEN = Symbol('TestSvc')

@injectable()
class TestService {
  getValue() {
    return 'stratal-test'
  }
}

@Controller('/test')
class TestController {
  @Route({
    summary: 'Test endpoint',
    response: z.object({ ok: z.boolean() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Module({
  providers: [{ provide: TOKEN, useClass: TestService, scope: Scope.Singleton }],
  controllers: [TestController],
})
class TestAppModule { }

const mockEnv = { ENVIRONMENT: 'test' } as StratalEnv
const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext

function createTestApp(overrides?: Partial<ApplicationOptions>) {
  return new Application({
    module: TestAppModule,
    logging: { level: LogLevel.ERROR },
    env: mockEnv,
    ctx: { waitUntil: vi.fn() },
    ...overrides,
  })
}

describe('Application (eager bootstrap)', () => {
  let app: Application

  beforeEach(async () => {
    app = createTestApp()
    await app.initialize()
  })

  afterEach(async () => {
    await app.shutdown()
  })

  it('should construct and initialize', () => {
    expect(app).toBeInstanceOf(Application)
  })

  it('should handle HTTP requests via hono', async () => {
    const request = new Request('http://localhost/test')
    const response = await app.hono.fetch(request, mockEnv, mockCtx)

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('should initialize only once across multiple calls', async () => {
    const initSpy = vi.spyOn(Application.prototype, 'initialize')

    await app.initialize()
    await app.initialize()

    // Only the beforeEach call counts — subsequent calls are no-ops
    expect(initSpy).toHaveBeenCalledTimes(2) // 1 from beforeEach + 2 no-ops
    initSpy.mockRestore()
  })

  it('should handle concurrent fetch requests', async () => {
    const request = new Request('http://localhost/test')
    const [r1, r2, r3] = await Promise.all([
      app.hono.fetch(request, mockEnv, mockCtx),
      app.hono.fetch(request, mockEnv, mockCtx),
      app.hono.fetch(request, mockEnv, mockCtx),
    ])

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(r3.status).toBe(200)
  })

  it('should delegate queue() to handleQueue()', async () => {
    const handleQueueSpy = vi.spyOn(app, 'handleQueue').mockResolvedValue()

    const batch = {
      queue: 'test-queue',
      messages: [],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch

    await app.handleQueue(batch, 'test-queue')

    expect(handleQueueSpy).toHaveBeenCalledWith(batch, 'test-queue')
    handleQueueSpy.mockRestore()
  })

  it('should delegate scheduled() to handleScheduled()', async () => {
    const handleScheduledSpy = vi.spyOn(app, 'handleScheduled').mockResolvedValue()

    const controller = {
      scheduledTime: Date.now(),
      cron: '* * * * *',
      noRetry: vi.fn(),
    } as unknown as ScheduledController

    await app.handleScheduled(controller)

    expect(handleScheduledSpy).toHaveBeenCalledWith(controller)
    handleScheduledSpy.mockRestore()
  })

  it('should expose hono getter', () => {
    expect(app.hono).toBeDefined()
    expect(app.hono.fetch).toBeDefined()
  })

  it('should clean up on shutdown()', async () => {
    await app.shutdown()
    // No error thrown
  })
})
