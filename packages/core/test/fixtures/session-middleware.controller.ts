import { inject } from '../../src/di'
import { Transient } from '../../src/di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../src/logger'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Get } from '../../src/router/decorators/http-method.decorator'
import type { Middleware, Next } from '../../src/router/middleware.interface'
import { type RouteConfigurable, type Router } from '../../src/router/router'
import type { RouterContext } from '../../src/router/router-context'

const SESSION_SERVICE = Symbol('SessionService')

/**
 * Simulates a session service that validates session cookies.
 * When the cookie is invalid, it throws (like Better Auth's getSession).
 */
@Transient(SESSION_SERVICE)
class FakeSessionService {
  getSession(headers: Headers): { user: { id: string } } | null {
    const cookie = headers.get('cookie') ?? ''
    const match = cookie.match(/better-auth\.session_token=([^;]+)/)

    if (!match) return null

    const token = match[1]

    // Simulate Better Auth behavior: invalid tokens cause a DB lookup failure
    if (token === 'invalid-token' || token === 'expired-token') {
      throw new Error('Session not found or expired')
    }

    // Valid token
    return { user: { id: 'user-123' } }
  }
}

/**
 * Mirrors SessionVerificationMiddleware from @stratal/framework:
 * - Calls a session service to validate the cookie
 * - On success, populates context
 * - On failure, catches and logs
 * - Always calls next() exactly once
 */
@Transient()
class TestSessionVerificationMiddleware implements Middleware {
  constructor(
    @inject(SESSION_SERVICE) private readonly sessionService: FakeSessionService,
    @inject(LOGGER_TOKENS.LoggerService) private logger: LoggerService,
  ) { }

  async handle(ctx: RouterContext, next: Next): Promise<void> {
    try {
      const session = this.sessionService.getSession(ctx.c.req.raw.headers)

      if (session) {
        // Simulate populating auth context
        ctx.c.set('userId' as never, session.user.id as never)
      }
    } catch (error: unknown) {
      this.logger.debug('Session validation failed', { error })
    }

    await next()
  }
}

/**
 * Simple middleware that runs before session verification (like AuthContextMiddleware).
 */
@Transient()
class TestAuthContextMiddleware implements Middleware {
  async handle(_ctx: RouterContext, next: Next): Promise<void> {
    await next()
  }
}

@Controller('/api/session-test')
export class SessionTestController {
  @Get('/')
  index(ctx: RouterContext) {
    return ctx.json({ ok: true, userId: ctx.c.get('userId' as never) ?? null })
  }
}

@Module({
  providers: [
    FakeSessionService,
    TestSessionVerificationMiddleware,
    TestAuthContextMiddleware,
  ],
  controllers: [SessionTestController],
})
export class SessionMiddlewareAppModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.use(TestAuthContextMiddleware, TestSessionVerificationMiddleware)
  }
}
