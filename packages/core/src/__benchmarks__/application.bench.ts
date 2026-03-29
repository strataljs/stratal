import { injectable } from 'tsyringe'
import { bench, describe } from 'vitest'
import { Application, type ApplicationConfig } from '../application'
import { Scope } from '../di/types'
import type { StratalEnv } from '../env'
import { z } from '../i18n/validation'
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

@Controller('/api/bench/users')
@injectable()
class BenchUsersController {
  @Route({ summary: 'List users', response: z.object({ users: z.array(z.string()) }) })
  index(ctx: RouterContext) { return ctx.json({ users: [] }) }

  @Route({ summary: 'Get user', params: z.object({ id: z.string() }), response: z.object({ id: z.string() }) })
  show(ctx: RouterContext) { return ctx.json({ id: '1' }) }

  @Route({ summary: 'Create user', body: z.object({ name: z.string() }), response: z.object({ id: z.string() }) })
  create(ctx: RouterContext) { return ctx.json({ id: '1' }) }
}

@Controller('/api/bench/posts')
@injectable()
class BenchPostsController {
  @Route({ summary: 'List posts', response: z.object({ posts: z.array(z.string()) }) })
  index(ctx: RouterContext) { return ctx.json({ posts: [] }) }

  @Route({ summary: 'Get post', params: z.object({ id: z.string() }), response: z.object({ id: z.string() }) })
  show(ctx: RouterContext) { return ctx.json({ id: '1' }) }
}

@Controller('/api/bench/comments')
@injectable()
class BenchCommentsController {
  @Route({ summary: 'List comments', response: z.object({ comments: z.array(z.string()) }) })
  index(ctx: RouterContext) { return ctx.json({ comments: [] }) }
}

@Controller('/api/bench/tags')
@injectable()
class BenchTagsController {
  @Route({ summary: 'List tags', response: z.object({ tags: z.array(z.string()) }) })
  index(ctx: RouterContext) { return ctx.json({ tags: [] }) }
}

@Module({
  providers: [
    { provide: TOKEN_SVC, useClass: AppBenchService, scope: Scope.Singleton },
  ],
  controllers: [BenchController],
})
class BenchAppModule { }

@Module({
  providers: [
    { provide: TOKEN_SVC, useClass: AppBenchService, scope: Scope.Singleton },
  ],
  controllers: [
    BenchController,
    BenchUsersController,
    BenchPostsController,
    BenchCommentsController,
    BenchTagsController,
  ],
})
class BenchMultiControllerModule { }

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
    new Application({ ...config, env: {} as StratalEnv, ctx: mockCtx })
  })

  bench('full initialize()', async () => {
    const app = new Application({ ...config, env: {} as StratalEnv, ctx: mockCtx })
    await app.initialize()
  })
})

describe('Application - Service Resolution', () => {
  bench('resolve service after bootstrap', async () => {
    const app = new Application({ ...config, env: {} as StratalEnv, ctx: mockCtx })
    await app.initialize()
    app.resolve(TOKEN_SVC)
  })
})

const multiControllerConfig: ApplicationConfig = {
  module: BenchMultiControllerModule,
  logging: { level: LogLevel.ERROR, formatter: 'json' },
}

describe('Application - Multi-Controller Bootstrap', () => {
  bench('initialize with 5 controllers (10 routes)', async () => {
    const app = new Application({ ...multiControllerConfig, env: {} as StratalEnv, ctx: mockCtx })
    await app.initialize()
  })

  bench('resolve service after multi-controller bootstrap', async () => {
    const app = new Application({ ...multiControllerConfig, env: {} as StratalEnv, ctx: mockCtx })
    await app.initialize()
    app.resolve(TOKEN_SVC)
  })
})
