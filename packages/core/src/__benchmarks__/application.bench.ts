import { injectable } from 'tsyringe'
import { bench, describe } from 'vitest'
import { z } from 'zod'
import { Application, type ApplicationConfig } from '../application'
import { Scope } from '../di/types'
import type { StratalEnv } from '../env'
import { LogLevel } from '../logger'
import { Module } from '../module/module.decorator'
import { Controller } from '../router/decorators/controller.decorator'
import { Route } from '../router/decorators/route.decorator'
import type { RouterContext } from '../router/router-context'

// Fixtures

const TOKEN_SVC = Symbol('BenchAppSvc')

@injectable()
class AppBenchService {
  getValue() {
    return 'bench'
  }
}

@Controller('/api/bench')
class BenchController {
  @Route({
    summary: 'Benchmark endpoint',
    response: z.object({ message: z.string() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ message: 'ok' })
  }
}

@Module({
  providers: [
    { provide: TOKEN_SVC, useClass: AppBenchService, scope: Scope.Singleton },
  ],
  controllers: [BenchController],
})
class BenchAppModule { }

const mockCtx = {
  waitUntil: () => {
    //
  },
  passThroughOnException: () => {
    //
  },
} as unknown as ExecutionContext

const config: ApplicationConfig = {
  module: BenchAppModule,
  logging: { level: LogLevel.ERROR, formatter: 'json' },
}

describe('Application - Bootstrap', () => {
  bench('constructor only', () => {
    new Application({} as StratalEnv, mockCtx, config)
  })

  bench('full initialize()', async () => {
    const app = new Application({} as StratalEnv, mockCtx, config)
    await app.initialize()
  })
})

describe('Application - Service Resolution', () => {
  bench('resolve service after bootstrap', async () => {
    const app = new Application({} as StratalEnv, mockCtx, config)
    await app.initialize()
    app.resolve(TOKEN_SVC)
  })
})
