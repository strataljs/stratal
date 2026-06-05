import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, type ApplicationOptions } from '../application';
import type { CronJob } from '../cron/cron-job';
import { inject, Transient } from '../di/decorators';
import { DI_TOKENS } from '../di/tokens';
import type { StratalEnv } from '../env';
import type { EventContext, IEventRegistry } from '../events';
import { Listener, On } from '../events';
import { z } from '../i18n/validation/zod';
import { LogLevel } from '../logger';
import { Module } from '../module/module.decorator';
import type { ModuleContext, OnInitialize, OnShutdown } from '../module/types';
import { Command } from '../quarry';
import { InjectQueue, QueueModule, type IQueueConsumer, type IQueueSender, type QueueMessage } from '../queue';
import { Controller } from '../router/decorators/controller.decorator';
import { Route } from '../router/decorators/route.decorator';
import type { RouterContext } from '../router/router-context';
import { RouterError } from '../router/router.error';
import type { Constructor } from '../types';

// Fixtures

const TOKEN = Symbol('TestSvc')

@Transient()
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
  providers: [{ provide: TOKEN, useClass: TestService }],
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

  it('should throw RouterError for controller without route decorators', async () => {
    const noDecoratorApp = createTestApp({ module: NoDecoratorModule })
    await noDecoratorApp.initialize()
    await expect(noDecoratorApp.ensureHono()).rejects.toThrow(RouterError)
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
  static schedule = '*/5 * * * *'

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
    { provide: REQUEST_SCOPED_TOKEN, useClass: RequestScopedService },
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

// ──────────────────────────────────────────────────────────────────
// Cron jobs that emit events must trigger @Listener() handlers.
// Regression: handleScheduled used to skip initializeHandlers, leaving
// EventRegistry empty so emit() silently dropped events.
// ──────────────────────────────────────────────────────────────────

const scheduledListenerInvocations: string[] = []

@Listener()
class ScheduledEventListener {
  @On('test.scheduled.event' as never)
   handle(ctx: EventContext<never>) {
    scheduledListenerInvocations.push((ctx as { data?: { tag?: string } }).data?.tag ?? 'no-tag')
  }
}

@Transient()
class EmittingCronJob implements CronJob {
  static schedule = '*/5 * * * *'

  constructor(
    @inject(DI_TOKENS.EventRegistry) private readonly events: IEventRegistry,
  ) { }

  async execute(): Promise<void> {
    await this.events.emit('test.scheduled.event' as never, {
      data: { tag: 'from-cron' },
    } as never)
  }
}

@Module({
  providers: [ScheduledEventListener],
  jobs: [EmittingCronJob as Constructor],
})
class CronEventsModule { }

describe('handleScheduled (event emission from cron jobs)', () => {
  let app: Application

  beforeEach(async () => {
    scheduledListenerInvocations.length = 0
    app = new Application({
      module: CronEventsModule,
      logging: { level: LogLevel.ERROR },
      env: mockEnv,
      ctx: { waitUntil: vi.fn() },
    })
    await app.initialize()
  })

  afterEach(async () => {
    await app.shutdown()
  })

  it('should fire @Listener() handlers for events emitted from cron jobs', async () => {
    const controller = {
      scheduledTime: Date.now(),
      cron: '*/5 * * * *',
      noRetry: vi.fn(),
    } as unknown as ScheduledController

    await app.handleScheduled(controller)

    expect(scheduledListenerInvocations).toEqual(['from-cron'])
  })
})

// ──────────────────────────────────────────────────────────────────
// Regression: a job with `readonly schedule` (instance property)
// instead of `static schedule` silently fails to register because
// the framework reads JobClass.schedule at registration time.
// ──────────────────────────────────────────────────────────────────

const instanceScheduleExecutions: string[] = []

@Transient()
class InstanceScheduleJob implements CronJob {
  readonly schedule = '*/3 * * * *'

  execute(): Promise<void> {
    instanceScheduleExecutions.push('executed')
    return Promise.resolve()
  }
}

@Module({
  jobs: [InstanceScheduleJob as Constructor],
})
class InstanceScheduleModule { }

describe('registerCronJobs (static vs instance schedule)', () => {
  it('should not register a job whose schedule is an instance property instead of static', async () => {
    const app = new Application({
      module: InstanceScheduleModule,
      logging: { level: LogLevel.ERROR },
      env: mockEnv,
      ctx: { waitUntil: vi.fn() },
    })

    await app.initialize()
    instanceScheduleExecutions.length = 0

    const controller = {
      scheduledTime: Date.now(),
      cron: '*/3 * * * *',
      noRetry: vi.fn(),
    } as unknown as ScheduledController

    await app.handleScheduled(controller)

    expect(instanceScheduleExecutions).toHaveLength(0)

    await app.shutdown()
  })
})

// ──────────────────────────────────────────────────────────────────
// Regression: a CLI command is a non-HTTP scope that may dispatch to
// queues and emit events (e.g. tenant:bootstrap → email.send /
// tenant.geo.seed). handleCommand must initialize the queue subsystem
// so consumers are registered; otherwise the sync provider finds zero
// consumers and silently drops every dispatched message.
// ──────────────────────────────────────────────────────────────────

const commandQueueHandled: string[] = []
const commandEventFired: string[] = []

@Transient()
class CommandTriggeredConsumer implements IQueueConsumer<{ tag: string }> {
  readonly messageTypes = ['command.test.message']
   handle(message: QueueMessage<{ tag: string }>): Promise<void> {
    commandQueueHandled.push(message.payload.tag)
    return Promise.resolve()
  }
  async onError(): Promise<void> { /* no-op */ }
}

@Listener()
class CommandTriggeredListener {
  @On('command.test.event' as never)
  handle(ctx: EventContext<never>): void {
    commandEventFired.push((ctx as { data?: { tag?: string } }).data?.tag ?? 'no-tag')
  }
}

const requestScopedListenerRan: string[] = []

// Regression: a @Listener that injects a request-scoped provider (@InjectQueue →
// request-scoped QueueRegistry). Listeners are resolved fresh per event from the
// emitting request scope, so this must NOT crash at boot (listeners are no longer
// instantiated during initialize()) and must run within the emitting request.
@Listener()
class RequestScopedQueueListener {
  constructor(@InjectQueue('TEST_QUEUE') private readonly queue: IQueueSender) {}

  @On('command.test.event' as never)
  handle(ctx: EventContext<never>): void {
    void this.queue
    requestScopedListenerRan.push((ctx as { data?: { tag?: string } }).data?.tag ?? 'no-tag')
  }
}

@Transient()
class DispatchingCommand extends Command {
  static command = 'test:dispatch'
  static description = 'Dispatches a queue message and emits an event'

  constructor(
    @InjectQueue('TEST_QUEUE') private readonly queue: IQueueSender,
    @inject(DI_TOKENS.EventRegistry) private readonly events: IEventRegistry,
  ) {
    super()
  }

  async handle(): Promise<void> {
    await this.events.emit('command.test.event' as never, { data: { tag: 'from-command' } } as never)
    await this.queue.dispatch({ type: 'command.test.message', payload: { tag: 'from-command' } })
  }
}

const requestScopedConsumerHandled: string[] = []

// Regression: a consumer that injects a request-scoped provider (@InjectQueue →
// request-scoped QueueRegistry). Consumers are resolved fresh per message inside
// the request scope, so this must instantiate at boot (to read messageTypes) and
// at dispatch without "resolved outside a request scope" crashing the app.
@Transient()
class RequestScopedDepConsumer implements IQueueConsumer<{ tag: string }> {
  readonly messageTypes = ['command.requestscoped.message']

  constructor(@InjectQueue('TEST_QUEUE') private readonly queue: IQueueSender) {
    void this.queue
  }

  handle(message: QueueMessage<{ tag: string }>): Promise<void> {
    requestScopedConsumerHandled.push(message.payload.tag)
    return Promise.resolve()
  }
}

@Transient()
class RequestScopedDispatchCommand extends Command {
  static command = 'test:dispatch-rs'
  static description = 'Dispatches a message handled by a request-scoped consumer'

  constructor(@InjectQueue('TEST_QUEUE') private readonly queue: IQueueSender) {
    super()
  }

  async handle(): Promise<void> {
    await this.queue.dispatch({ type: 'command.requestscoped.message', payload: { tag: 'rs' } })
  }
}

@Module({
  imports: [
    QueueModule.forRootAsync({ useFactory: () => ({ provider: 'sync' }) }),
    QueueModule.registerQueue('TEST_QUEUE'),
  ],
  providers: [DispatchingCommand, RequestScopedDispatchCommand, CommandTriggeredListener, RequestScopedQueueListener],
  consumers: [CommandTriggeredConsumer, RequestScopedDepConsumer],
})
class CommandQueueModule { }

describe('handleCommand (queue + event processing)', () => {
  let app: Application

  beforeEach(async () => {
    commandQueueHandled.length = 0
    commandEventFired.length = 0
    requestScopedConsumerHandled.length = 0
    requestScopedListenerRan.length = 0
    app = new Application({
      module: CommandQueueModule,
      logging: { level: LogLevel.ERROR },
      env: mockEnv,
      ctx: { waitUntil: vi.fn() },
    })
    await app.initialize()
  })

  afterEach(async () => {
    await app.shutdown()
  })

  it('processes queue messages dispatched from a CLI command (sync provider)', async () => {
    await app.handleCommand('test:dispatch')

    expect(commandQueueHandled).toEqual(['from-command'])
  })

  it('boots and runs a @Listener that injects a request-scoped provider', async () => {
    // Regression: app.initialize() (above) must not crash wiring a listener with
    // a request-scoped dependency, and the listener must run within the request.
    await app.handleCommand('test:dispatch')

    expect(requestScopedListenerRan).toEqual(['from-command'])
  })

  it('fires @Listener() handlers for events emitted from a CLI command', async () => {
    await app.handleCommand('test:dispatch')

    expect(commandEventFired).toEqual(['from-command'])
  })

  it('boots and dispatches to a consumer that injects a request-scoped provider', async () => {
    // Regression: app.initialize() (above) must not crash registering a consumer
    // with a request-scoped dependency, and the consumer must handle the message.
    await app.handleCommand('test:dispatch-rs')

    expect(requestScopedConsumerHandled).toEqual(['rs'])
  })
})

// ──────────────────────────────────────────────────────────────────
// Regression: a scheduled (cron) job is a non-HTTP scope that may
// dispatch to queues (timeout/reminder/digest emails). handleScheduled
// must initialize the queue subsystem so consumers are registered;
// otherwise the sync provider finds zero consumers and silently drops
// every dispatched message — the same class of bug as the command path.
// ──────────────────────────────────────────────────────────────────

const scheduledQueueHandled: string[] = []

@Transient()
class ScheduledTriggeredConsumer implements IQueueConsumer<{ tag: string }> {
  readonly messageTypes = ['scheduled.test.message']
   handle(message: QueueMessage<{ tag: string }>): Promise<void> {
    scheduledQueueHandled.push(message.payload.tag)
    return Promise.resolve()
  }
  async onError(): Promise<void> { /* no-op */ }
}

@Transient()
class DispatchingCronJob implements CronJob {
  static schedule = '*/5 * * * *'

  constructor(
    @InjectQueue('TEST_QUEUE') private readonly queue: IQueueSender,
  ) { }

  async execute(): Promise<void> {
    await this.queue.dispatch({ type: 'scheduled.test.message', payload: { tag: 'from-cron' } })
  }
}

@Module({
  imports: [
    QueueModule.forRootAsync({ useFactory: () => ({ provider: 'sync' }) }),
    QueueModule.registerQueue('TEST_QUEUE'),
  ],
  jobs: [DispatchingCronJob as Constructor],
  consumers: [ScheduledTriggeredConsumer],
})
class ScheduledQueueModule { }

describe('handleScheduled (queue processing from cron jobs)', () => {
  let app: Application

  beforeEach(async () => {
    scheduledQueueHandled.length = 0
    app = new Application({
      module: ScheduledQueueModule,
      logging: { level: LogLevel.ERROR },
      env: mockEnv,
      ctx: { waitUntil: vi.fn() },
    })
    await app.initialize()
  })

  afterEach(async () => {
    await app.shutdown()
  })

  it('processes queue messages dispatched from a cron job (sync provider)', async () => {
    const controller = {
      scheduledTime: Date.now(),
      cron: '*/5 * * * *',
      noRetry: vi.fn(),
    } as unknown as ScheduledController

    await app.handleScheduled(controller)

    expect(scheduledQueueHandled).toEqual(['from-cron'])
  })
})

describe('Application (failed initialization teardown)', () => {
  // A boot that fails partway can still hold live resources: modules whose
  // onInitialize already ran (DB pools, timers) and container-cached
  // singletons. initialize() must tear those down itself — callers can't,
  // since shutdown() is deliberately a no-op for an uninitialized app.

  const lifecycleEvents: string[] = []
  const DISPOSABLE_TOKEN = Symbol('FailedInitDisposable')

  class DisposableResource {
    dispose() { lifecycleEvents.push('resource:disposed') }
  }

  @Module({})
  class HealthyModule implements OnInitialize, OnShutdown {
    onInitialize(context: ModuleContext) {
      lifecycleEvents.push('healthy:init')
      context.container.registerSingleton(DISPOSABLE_TOKEN, DisposableResource)
      context.container.resolve(DISPOSABLE_TOKEN)
    }

    onShutdown() {
      lifecycleEvents.push('healthy:shutdown')
    }
  }

  @Module({})
  class ExplodingModule implements OnInitialize {
    onInitialize(): never {
      throw new Error('exploding module')
    }
  }

  @Module({ imports: [HealthyModule, ExplodingModule] })
  class FailingAppModule { }

  beforeEach(() => {
    lifecycleEvents.length = 0
  })

  it('tears down already-initialized modules and the container, then rethrows', async () => {
    const app = createTestApp({ module: FailingAppModule })

    await expect(app.initialize()).rejects.toThrow('exploding module')

    expect(lifecycleEvents).toEqual(['healthy:init', 'healthy:shutdown', 'resource:disposed'])
  })

  it('keeps shutdown() a no-op after a failed initialize (no double teardown)', async () => {
    const app = createTestApp({ module: FailingAppModule })

    await expect(app.initialize()).rejects.toThrow('exploding module')
    await app.shutdown()

    expect(lifecycleEvents.filter(e => e === 'healthy:shutdown')).toHaveLength(1)
  })
})
