import { z } from '../../src/i18n/validation'
import { Module } from '../../src/module/module.decorator'
import { type ModuleClass, type ModuleContext, type OnInitialize } from '../../src/module/types'
import { RateLimit } from '../../src/rate-limiter/decorators/rate-limit.decorator'
import { Limit } from '../../src/rate-limiter/limit'
import { type RateLimiterRegistry } from '../../src/rate-limiter/rate-limiter-registry'
import { RateLimiterModule } from '../../src/rate-limiter/rate-limiter.module'
import { RATE_LIMITER_TOKENS } from '../../src/rate-limiter/rate-limiter.tokens'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Route } from '../../src/router/decorators/route.decorator'
import { type RouteConfigurable, type Router } from '../../src/router/router'
import { type RouterContext } from '../../src/router/router-context'

@Controller('/throttled')
export class ScopeThrottledController {
  @Route({ summary: 'Throttled by router.throttle()', response: z.object({ ok: z.boolean() }) })
  index(ctx: RouterContext) { return ctx.json({ ok: true }) }
}

@Controller('/decorated')
@RateLimit('test')
export class DecoratorThrottledController {
  @Route({ summary: 'Throttled by @RateLimit', response: z.object({ ok: z.boolean() }) })
  index(ctx: RouterContext) { return ctx.json({ ok: true }) }
}

@Module({})
export class LimiterDefinitionsModule implements OnInitialize {
  onInitialize({ container }: ModuleContext): void {
    const limiter = container.resolve<RateLimiterRegistry>(RATE_LIMITER_TOKENS.Registry)
    limiter.for('test', () => Limit.perMinute(2).by('shared-actor'))
  }
}

@Module({
  imports: [
    RateLimiterModule.forRoot({ store: 'memory' }),
    LimiterDefinitionsModule,
  ],
  controllers: [ScopeThrottledController],
})
export class ThrottleScopeAppModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.throttle('test')
  }
}

@Module({
  imports: [
    RateLimiterModule.forRoot({ store: 'memory' }),
    LimiterDefinitionsModule,
  ],
  controllers: [DecoratorThrottledController],
})
export class ThrottleDecoratorAppModule {}

/**
 * Imports RateLimiterModule but never calls forRoot — should fail at boot
 * with RateLimiterError thrown by the module's own onInitialize
 * hook.
 *
 * The cast widens RateLimiterModule's typed `forRoot(options)` back to the
 * broader `ModuleClass.forRoot?` signature; the cast is type-only and has
 * no runtime effect.
 */
@Module({
  imports: [RateLimiterModule as unknown as ModuleClass],
})
export class ThrottleUnconfiguredAppModule {}

/**
 * Uses router.throttle() but does NOT import RateLimiterModule. The
 * Registry token is unbound, so the optional inject in ThrottleMiddleware
 * returns undefined and surfaces RateLimiterError on the
 * first request.
 */
@Module({
  controllers: [ScopeThrottledController],
})
export class ThrottleNoModuleAppModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.throttle('test')
  }
}
