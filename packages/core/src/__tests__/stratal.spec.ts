import { inject, injectable } from 'tsyringe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application, type ApplicationOptions } from '../application'
import type { CronJob } from '../cron/cron-job'
import { Transient } from '../di/decorators'
import { Scope } from '../di/types'
import type { StratalEnv } from '../env'
import { z } from '../i18n/validation'
import { LogLevel } from '../logger'
import { Module } from '../module/module.decorator'
import { Controller } from '../router/decorators/controller.decorator'
import { Route } from '../router/decorators/route.decorator'
import { ControllerRegistrationError } from '../router/errors'
import type { RouterContext } from '../router/router-context'
import type { Constructor } from '../types'

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

@Controller('/no-decorators')
class NoDecoratorController {
  index(_ctx: RouterContext) { return _ctx.json({ ok: true }) }
}

@Module({ controllers: [NoDecoratorController] })
class NoDecoratorModule { }

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

  it('should handle HTTP requests via ensureHono', async () => {
    const request = new Request('http://localhost/test')
    const hono = await app.ensureHono()
    const response = await hono.fetch(request, mockEnv, mockCtx)

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
    const hono = await app.ensureHono()
    const [r1, r2, r3] = await Promise.all([
      hono.fetch(request, mockEnv, mockCtx),
      hono.fetch(request, mockEnv, mockCtx),
      hono.fetch(request, mockEnv, mockCtx),
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

  it('should expose ensureHono', async () => {
    const hono = await app.ensureHono()
    expect(hono).toBeDefined()
    expect(hono.fetch).toBeDefined()
  })

  it('should clean up on shutdown()', async () => {
    await app.shutdown()
    // No error thrown
  })

  it('should throw ControllerRegistrationError for controller without route decorators', async () => {
    const noDecoratorApp = createTestApp({ module: NoDecoratorModule })
    await noDecoratorApp.initialize()
    await expect(noDecoratorApp.ensureHono()).rejects.toThrow(ControllerRegistrationError)
  })
})

// ──────────────────────────────────────────────────────────────────
// Cron job with request-scoped dependency
// Regression: jobs must resolve from request-scoped container
// so that ContainerScoped services (like DB) get a fresh instance
// per scheduled invocation rather than a stale global-scope proxy.
// ──────────────────────────────────────────────────────────────────

const REQUEST_SCOPED_TOKEN = Symbol('RequestScopedService')

@Transient(REQUEST_SCOPED_TOKEN)
class RequestScopedService {
  readonly instanceId = crypto.randomUUID()
}

const cronJobExecutions: string[] = []

@Transient()
class TestCronJob implements CronJob {
  readonly schedule = '*/5 * * * *'

  constructor(
    @inject(REQUEST_SCOPED_TOKEN) private readonly service: RequestScopedService,
  ) { }

  async execute(): Promise<void> {
    cronJobExecutions.push(this.service.instanceId)

    return Promise.resolve();
  }
}

@Module({
  providers: [
    { provide: REQUEST_SCOPED_TOKEN, useClass: RequestScopedService, scope: Scope.Request },
  ],
  jobs: [TestCronJob as Constructor],
})
class CronJobModule { }

describe('handleScheduled (cron jobs with request-scoped deps)', () => {
  let app: Application

  beforeEach(async () => {
    cronJobExecutions.length = 0
    app = new Application({
      module: CronJobModule,
      logging: { level: LogLevel.ERROR },
      env: mockEnv,
      ctx: { waitUntil: vi.fn() },
    })
    await app.initialize()
  })

  afterEach(async () => {
    await app.shutdown()
  })

  it('should resolve cron job dependencies from request-scoped container', async () => {
    const controller = {
      scheduledTime: Date.now(),
      cron: '*/5 * * * *',
      noRetry: vi.fn(),
    } as unknown as ScheduledController

    await app.handleScheduled(controller)

    expect(cronJobExecutions).toHaveLength(1)
  })

  it('should create fresh request-scoped instances for each invocation', async () => {
    const controller = {
      scheduledTime: Date.now(),
      cron: '*/5 * * * *',
      noRetry: vi.fn(),
    } as unknown as ScheduledController

    await app.handleScheduled(controller)
    await app.handleScheduled(controller)

    expect(cronJobExecutions).toHaveLength(2)
    // Each invocation must get a different service instance
    expect(cronJobExecutions[0]).not.toBe(cronJobExecutions[1])
  })
})
