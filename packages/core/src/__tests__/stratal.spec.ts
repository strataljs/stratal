import { injectable } from 'tsyringe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application } from '../application'
import { Scope } from '../di/types'
import type { StratalEnv } from '../env'
import { LogLevel } from '../logger'
import { Module } from '../module/module.decorator'
import { Controller } from '../router/decorators/controller.decorator'
import { Route } from '../router/decorators/route.decorator'
import type { RouterContext } from '../router/router-context'
import { Stratal } from '../stratal'
import { z } from '../i18n/validation'

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
class TestAppModule {}

const mockEnv = {} as StratalEnv
const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext

describe('Stratal', () => {
  let stratal: Stratal

  beforeEach(() => {
    stratal = new Stratal({
      module: TestAppModule,
      logging: { level: LogLevel.ERROR },
    })
  })

  afterEach(async () => {
    await stratal.shutdown()
  })

  it('should construct with minimal config', () => {
    const app = new Stratal({ module: TestAppModule })
    expect(app).toBeInstanceOf(Stratal)
  })

  it('should lazily initialize on first fetch()', async () => {
    const request = new Request('http://localhost/test')
    const response = await stratal.fetch(request, mockEnv, mockCtx)

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('should initialize Application only once across multiple calls', async () => {
    const initSpy = vi.spyOn(Application.prototype, 'initialize')

    const request = new Request('http://localhost/test')
    await stratal.fetch(request, mockEnv, mockCtx)
    await stratal.fetch(request, mockEnv, mockCtx)
    await stratal.fetch(request, mockEnv, mockCtx)

    expect(initSpy).toHaveBeenCalledTimes(1)
    initSpy.mockRestore()
  })

  it('should handle concurrent initialization safely', async () => {
    const initSpy = vi.spyOn(Application.prototype, 'initialize')

    const request = new Request('http://localhost/test')
    const [r1, r2, r3] = await Promise.all([
      stratal.fetch(request, mockEnv, mockCtx),
      stratal.fetch(request, mockEnv, mockCtx),
      stratal.fetch(request, mockEnv, mockCtx),
    ])

    expect(initSpy).toHaveBeenCalledTimes(1)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(r3.status).toBe(200)
    initSpy.mockRestore()
  })

  it('should expose getApplication()', async () => {
    const app = await stratal.getApplication(mockEnv, mockCtx)
    expect(app).toBeInstanceOf(Application)
  })

  it('should delegate queue() to Application.handleQueue()', async () => {
    const app = await stratal.getApplication(mockEnv, mockCtx)
    const handleQueueSpy = vi.spyOn(app, 'handleQueue').mockResolvedValue()

    const batch = {
      queue: 'test-queue',
      messages: [],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch

    await stratal.queue(batch, mockEnv, mockCtx)

    expect(handleQueueSpy).toHaveBeenCalledWith(batch, 'test-queue')
    handleQueueSpy.mockRestore()
  })

  it('should delegate scheduled() to Application.handleScheduled()', async () => {
    const app = await stratal.getApplication(mockEnv, mockCtx)
    const handleScheduledSpy = vi.spyOn(app, 'handleScheduled').mockResolvedValue()

    const controller = {
      scheduledTime: Date.now(),
      cron: '* * * * *',
      noRetry: vi.fn(),
    } as unknown as ScheduledController

    await stratal.scheduled(controller, mockEnv, mockCtx)

    expect(handleScheduledSpy).toHaveBeenCalledWith(controller)
    handleScheduledSpy.mockRestore()
  })

  it('should work with destructured/bound methods', async () => {
    const { fetch } = stratal
    const request = new Request('http://localhost/test')
    const response = await fetch(request, mockEnv, mockCtx)

    expect(response.status).toBe(200)
  })

  it('should clean up on shutdown()', async () => {
    // Initialize first
    await stratal.getApplication(mockEnv, mockCtx)

    await stratal.shutdown()

    // After shutdown, next call should create a new Application
    const initSpy = vi.spyOn(Application.prototype, 'initialize')
    await stratal.getApplication(mockEnv, mockCtx)
    expect(initSpy).toHaveBeenCalledTimes(1)
    initSpy.mockRestore()
  })

  it('should be a no-op if shutdown() is called before initialization', async () => {
    await expect(stratal.shutdown()).resolves.toBeUndefined()
  })
})
