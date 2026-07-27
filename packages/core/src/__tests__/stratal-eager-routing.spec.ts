import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application, type ApplicationConfig } from '../application';
import type { StratalEnv } from '../env';
import { boolean, object } from 'zod/mini';
import { LoggerService, LogLevel } from '../logger';
import { Module } from '../module/module.decorator';
import { Controller } from '../router/decorators/controller.decorator';
import { Route } from '../router/decorators/route.decorator';
import type { RouterContext } from '../router/router-context';
import { Stratal } from '../stratal';

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
class HttpModule { }

// No controllers — a queue/scheduled/cron-only worker.
@Module({})
class HttplessModule { }

const httpConfig: ApplicationConfig = {
  module: HttpModule,
  logging: { level: LogLevel.ERROR },
}

const httplessConfig: ApplicationConfig = {
  module: HttplessModule,
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

describe('Stratal (eager route pre-warm)', () => {
  let current: Stratal | null = null

  afterEach(async () => {
    await current?.shutdown()
    current = null
    vi.restoreAllMocks()
  })

  it('builds the routing stack as part of boot when the app serves HTTP', async () => {
    const ensureHonoSpy = vi.spyOn(Application.prototype, 'ensureHono')

    current = new Stratal(httpConfig)
    // The eager registration is awaited inside prepareApp, so by the time the
    // init promise resolves, routing has already been built — before any fetch().
    await getInitPromise(current)

    expect(ensureHonoSpy).toHaveBeenCalled()
  })

  it('does not register routes at boot for a queue/scheduled-only app', async () => {
    const ensureHonoSpy = vi.spyOn(Application.prototype, 'ensureHono')

    current = new Stratal(httplessConfig)
    await getInitPromise(current)

    expect(ensureHonoSpy).not.toHaveBeenCalled()
  })

  it('still serves the pre-warmed routes on the first request', async () => {
    current = new Stratal(httpConfig)

    const response = await current.fetch(new Request('http://localhost/ping'), mockEnv, mockCtx)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('logs a boot-time route registration failure via the logger without failing boot', async () => {
    const loggerError = vi.spyOn(LoggerService.prototype, 'error').mockImplementation(() => { /* silence */ })
    const failure = new Error('broken route config')
    vi.spyOn(Application.prototype, 'ensureHono').mockRejectedValue(failure)

    current = new Stratal(httpConfig)

    // Boot must still resolve — a routing failure is caught, not rethrown, so it
    // doesn't take down queue/scheduled handlers on a mixed worker.
    await expect(getInitPromise(current)).resolves.toBeInstanceOf(Application)
    expect(loggerError).toHaveBeenCalledWith('[stratal] Eager route registration failed', failure)
  })
})
