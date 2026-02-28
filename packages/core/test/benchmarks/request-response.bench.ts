import { afterAll, beforeAll, bench, describe } from 'vitest'
import { Application, type ApplicationConfig } from '../../src/application'
import type { StratalEnv } from '../../src/env'
import { LogLevel } from '../../src/logger/contracts'
import type { RouterService } from '../../src/router/router.service'
import { ROUTER_TOKENS } from '../../src/router/router.tokens'
import { BenchAppModule } from '../fixtures/app.module'

let router: RouterService
let env: StratalEnv
let ctx: ExecutionContext
let app: Application

beforeAll(async () => {
  env = {
    ENVIRONMENT: 'production',
    CACHE: {
      get: () => null,
      put: () => null,
      delete: () => null,
      list: () => ({ keys: [], list_complete: true, cacheStatus: null }),
      getWithMetadata: () => ({ value: null, metadata: null, cacheStatus: null }),
    } as unknown as KVNamespace,
  }
  ctx = {
    waitUntil: () => null,
    passThroughOnException: () => null,
  } as unknown as ExecutionContext

  const config: ApplicationConfig = {
    module: BenchAppModule,
    logging: { level: LogLevel.ERROR },
  }

  app = new Application(env, ctx, config)
  await app.initialize()
  router = app.resolve<RouterService>(ROUTER_TOKENS.RouterService)
})

afterAll(async () => {
  await app.shutdown()
})

describe('Request/Response', () => {
  bench('simple GET - 200', async () => {
    await router.fetch(new Request('http://localhost/api/bench'), env, ctx)
  })

  bench('GET with route params - 200', async () => {
    await router.fetch(new Request('http://localhost/api/bench/items/123'), env, ctx)
  })

  bench('POST with JSON body - 201', async () => {
    await router.fetch(
      new Request('http://localhost/api/bench/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'benchmark-item' }),
      }),
      env,
      ctx,
    )
  })

  bench('POST invalid body - validation error', async () => {
    await router.fetch(
      new Request('http://localhost/api/bench/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env,
      ctx,
    )
  })

  bench('GET unknown route - 404', async () => {
    await router.fetch(new Request('http://localhost/api/bench/nonexistent'), env, ctx)
  })
})
