import { boolean, object } from 'zod/mini'
import { Module } from '../../src/module/module.decorator'
import { Cacheable, PurgesCache } from '../../src/response-cache/decorators'
import { ResponseCacheModule } from '../../src/response-cache/response-cache.module'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Get, Post } from '../../src/router/decorators/http-method.decorator'
import type { RouterContext } from '../../src/router/router-context'

@Controller('/cache-demo')
export class ResponseCacheDemoController {
  @Get('/plain', { response: object({ ok: boolean() }) })
  plain(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Get('/cacheable', { response: object({ ok: boolean() }) })
  @Cacheable({ ttl: 60, tags: ['demo'] })
  cacheable(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Post('/purge', { response: object({ ok: boolean() }) })
  @PurgesCache({ tags: ['demo'] })
  purge(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Controller('/cache-demo-clean')
export class NoCacheDemoController {
  @Get('/plain', { response: object({ ok: boolean() }) })
  plain(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

/** Has response-cache decorators in play — the boot check applies. */
@Module({
  controllers: [ResponseCacheDemoController],
  imports: [ResponseCacheModule.forRoot({})],
})
export class ResponseCacheAppModule {}

/** No `@Cacheable`/`@PurgesCache` anywhere — the boot check never engages. */
@Module({
  controllers: [NoCacheDemoController],
})
export class NoCacheAppModule {}

// ── Gateway fixtures ──────────────────────────────────────────────────

/**
 * Header-driven partition, so one app can exercise the resolve / return-null /
 * throw branches from the test rather than needing three apps.
 */
function userPartition(ctx: RouterContext): string | null {
  const header = ctx.c.req.header('x-user')
  if (header === 'boom') throw new Error('resolver exploded')
  return header ?? null
}

@Controller('/gateway-demo')
export class GatewayDemoController {
  @Get('/dashboard', { response: object({ ok: boolean() }) })
  @Cacheable({ ttl: 60, partitionBy: ['user'] })
  dashboard(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Get('/pricing', { response: object({ ok: boolean() }) })
  @Cacheable({ ttl: 3600 })
  pricing(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Post('/dashboard', { response: object({ ok: boolean() }) })
  @PurgesCache({ tags: ['dashboard'] })
  write(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

/** Declares a gateway entrypoint, so `partitionBy` is permitted. */
@Module({
  controllers: [GatewayDemoController],
  imports: [
    ResponseCacheModule.forRoot({
      gateway: { entrypoint: 'Cached' },
      partitions: { user: userPartition },
    }),
  ],
})
export class GatewayAppModule {}
