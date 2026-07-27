import { Transient } from '../di'
import { bench, describe } from 'vitest'
import { Application, type ApplicationConfig } from '../application'
import type { StratalEnv } from '../env'
import { array, object, string } from 'zod/mini'
import { LogLevel } from '../logger'
import { Module } from '../module/module.decorator'
import { Controller } from '../router/decorators/controller.decorator'
import { Route } from '../router/decorators/route.decorator'
import type { RouterContext } from '../router/router-context'

// Fixtures

const TOKEN_SVC = Symbol('BenchAppSvc')

@Transient()
class AppBenchService {
  getValue() {
    return 'bench'
  }
}

@Controller('/api/bench')
class BenchController {
  @Route({
    summary: 'Benchmark endpoint',
    response: object({ message: string() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ message: 'ok' })
  }
}

@Controller('/api/bench/users')
@Transient()
class BenchUsersController {
  @Route({ summary: 'List users', response: object({ users: array(string()) }) })
  index(ctx: RouterContext) { return ctx.json({ users: [] }) }

  @Route({ summary: 'Get user', params: object({ id: string() }), response: object({ id: string() }) })
  show(ctx: RouterContext) { return ctx.json({ id: '1' }) }

  @Route({ summary: 'Create user', body: object({ name: string() }), response: object({ id: string() }) })
  create(ctx: RouterContext) { return ctx.json({ id: '1' }) }
}

@Controller('/api/bench/posts')
@Transient()
class BenchPostsController {
  @Route({ summary: 'List posts', response: object({ posts: array(string()) }) })
  index(ctx: RouterContext) { return ctx.json({ posts: [] }) }

  @Route({ summary: 'Get post', params: object({ id: string() }), response: object({ id: string() }) })
  show(ctx: RouterContext) { return ctx.json({ id: '1' }) }
}

@Controller('/api/bench/comments')
@Transient()
class BenchCommentsController {
  @Route({ summary: 'List comments', response: object({ comments: array(string()) }) })
  index(ctx: RouterContext) { return ctx.json({ comments: [] }) }
}

@Controller('/api/bench/tags')
@Transient()
class BenchTagsController {
  @Route({ summary: 'List tags', response: object({ tags: array(string()) }) })
  index(ctx: RouterContext) { return ctx.json({ tags: [] }) }
}

@Module({
  providers: [
    { provide: TOKEN_SVC, useClass: AppBenchService },
  ],
  controllers: [BenchController],
})
class BenchAppModule { }

@Module({
  providers: [
    { provide: TOKEN_SVC, useClass: AppBenchService },
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
  bench('initialize with 5 controllers (8 routes)', async () => {
    const app = new Application({ ...multiControllerConfig, env: {} as StratalEnv, ctx: mockCtx })
    await app.initialize()
  })

  bench('resolve service after multi-controller bootstrap', async () => {
    const app = new Application({ ...multiControllerConfig, env: {} as StratalEnv, ctx: mockCtx })
    await app.initialize()
    app.resolve(TOKEN_SVC)
  })
})
