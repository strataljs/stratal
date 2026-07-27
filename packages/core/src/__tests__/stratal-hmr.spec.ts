import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application, type ApplicationConfig } from '../application';
import type { StratalEnv } from '../env';
import { StratalNotInitializedError, StratalSupersededError } from '../errors';
import { boolean, object } from 'zod/mini';
import { LogLevel } from '../logger';
import { Module } from '../module/module.decorator';
import { Controller } from '../router/decorators/controller.decorator';
import { Route } from '../router/decorators/route.decorator';
import type { RouterContext } from '../router/router-context';
import { Stratal } from '../stratal';
import { forceGc } from '../workers/__tests__/__helpers__/force-gc';

// Stratal.prepareApp dynamically imports cloudflare:workers for env/waitUntil.
vi.mock('cloudflare:workers', () => ({
  env: { ENVIRONMENT: 'test' },
  waitUntil: vi.fn(),
}))

@Controller('/ping')
class PingController {
  @Route({
    summary: 'Ping',
    response: object({ ok: boolean() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Module({ controllers: [PingController] })
class TestAppModule { }

const config: ApplicationConfig = {
  module: TestAppModule,
  logging: { level: LogLevel.ERROR },
}

const mockEnv = { ENVIRONMENT: 'test' } as StratalEnv
const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext

function getInitPromise(instance: Stratal): Promise<Application> {
  return Reflect.get(instance, 'initPromise') as Promise<Application>
}

/** Flushes microtasks (mocked dynamic imports, barrier awaits) via one macrotask. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Parks Application.initialize on a gate so a generation can be deterministically
 * superseded mid-boot before its final generation check runs.
 */
function gateInitialize(): { release: () => void } {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const origInit = Application.prototype.initialize
  vi.spyOn(Application.prototype, 'initialize').mockImplementation(async function (this: Application) {
    await gate
    return origInit.call(this)
  })
  return { release }
}

/**
 * Records init/shutdown phase markers so tests can assert that a superseded
 * generation finished tearing down before the next one started booting.
 */
function instrumentLifecycle(events: string[]): void {
  const origInit = Application.prototype.initialize
  const origShutdown = Application.prototype.shutdown
  vi.spyOn(Application.prototype, 'initialize').mockImplementation(async function (this: Application) {
    events.push('init:start')
    await origInit.call(this)
    events.push('init:end')
  })
  vi.spyOn(Application.prototype, 'shutdown').mockImplementation(async function (this: Application) {
    events.push('shutdown:start')
    await origShutdown.call(this)
    events.push('shutdown:end')
  })
}

// Simulates what a Vite HMR reload does in the worker isolate: re-evaluating
// the user entry constructs a new `Stratal` while the previous one is live.
describe('Stratal (HMR reload lifecycle)', () => {
  let current: Stratal | null = null

  afterEach(async () => {
    await current?.shutdown()
    current = null
    vi.restoreAllMocks()
  })

  it('tears down the previous generation before initializing the next', async () => {
    const events: string[] = []
    instrumentLifecycle(events)

    const s1 = new Stratal(config)
    await s1.hono

    current = new Stratal(config)
    await current.hono

    expect(events).toEqual([
      'init:start', 'init:end',
      'shutdown:start', 'shutdown:end',
      'init:start', 'init:end',
    ])
  })

  it('rejects a generation superseded mid-boot with StratalSupersededError', async () => {
    const { release } = gateInitialize()

    const s1 = new Stratal(config)
    await tick() // s1 is parked inside its gated initialize
    current = new Stratal(config)
    release()

    await expect(getInitPromise(s1)).rejects.toBeInstanceOf(StratalSupersededError)
    await current.hono
  })

  it('serves in-flight requests on a superseded instance from the replacing generation', async () => {
    const { release } = gateInitialize()

    const s1 = new Stratal(config)
    await tick()
    current = new Stratal(config)
    release()

    const response = await s1.fetch(new Request('http://localhost/ping'), mockEnv, mockCtx)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('resolveApplication retries superseded generations until it lands on the live one', async () => {
    const { release } = gateInitialize()

    const s1 = new Stratal(config)
    void s1
    await tick()
    // Grab the application while only the soon-to-be-superseded generation exists.
    const resolving = Stratal.resolveApplication()
    current = new Stratal(config)
    release()

    expect(await resolving).toBe(await getInitPromise(current))
  })

  it('logs real bootstrap failures even when nothing awaits initialization', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* silence */ })
    const failure = new Error('bootstrap exploded')
    vi.spyOn(Application.prototype, 'initialize').mockRejectedValue(failure)

    current = new Stratal(config)
    await tick() // no awaiter — without the catch-and-log this would be invisible

    expect(consoleError).toHaveBeenCalledWith('[stratal] Initialization failed:', failure)
  })

  it('does not log supersession as a bootstrap failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* silence */ })
    const { release } = gateInitialize()

    const s1 = new Stratal(config)
    void s1
    await tick()
    current = new Stratal(config)
    release()
    await current.hono

    expect(consoleError).not.toHaveBeenCalled()
  })

  it('clears the static singleton when the live generation shuts down explicitly', async () => {
    const instance = new Stratal(config)
    await instance.hono

    await instance.shutdown()

    // No replacing generation exists — resolveApplication must not hand out
    // the disposed Application.
    await expect(Stratal.resolveApplication()).rejects.toBeInstanceOf(StratalNotInitializedError)
  })

  it('keeps the static singleton when a superseded generation shuts down', async () => {
    const s1 = new Stratal(config)
    await s1.hono
    current = new Stratal(config)
    await current.hono // teardown chain has already shut s1 down

    await s1.shutdown() // explicit no-op shutdown of the old generation

    expect(await Stratal.resolveApplication()).toBe(await getInitPromise(current))
  })

  it('releases the previous generation\'s Application for garbage collection', async () => {
    // Inner function scope so nothing in the test frame retains the old instance.
    const createGeneration = async (): Promise<WeakRef<Application>> => {
      const instance = new Stratal(config)
      await instance.hono
      return new WeakRef(await getInitPromise(instance))
    }

    const oldAppRef = await createGeneration()

    current = new Stratal(config)
    await current.hono

    await forceGc()

    expect(oldAppRef.deref()).toBeUndefined()
  })
})
