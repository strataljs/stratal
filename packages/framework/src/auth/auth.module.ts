/**
 * Auth Module
 *
 * Provides configurable authentication using Better Auth.
 * Use `withRootAsync` to configure Better Auth options from the application layer.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     AuthModule.withRootAsync({
 *       inject: [DI_TOKENS.Database, CONFIG_TOKENS.ConfigService],
 *       useFactory: (db, config) => createAuthOptions(db, config)
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 */

import type { BetterAuthOptions } from 'better-auth'
import type { MiddlewareConfigurable, MiddlewareConsumer } from 'stratal/middleware'
import { Module } from 'stratal/module'
import type { AsyncModuleOptions, DynamicModule } from 'stratal/module'
import { AUTH_OPTIONS, AUTH_SERVICE } from './auth.tokens'
import { AuthContextMiddleware } from './middleware/auth-context.middleware'
import { SessionVerificationMiddleware } from './middleware/session-verification.middleware'
import { AuthService } from './services/auth.service'

@Module({
  providers: []
})
export class AuthModule implements MiddlewareConfigurable {
  /**
   * Configure auth middleware.
   *
   * Registers middlewares in order:
   * 1. AuthContextMiddleware - Creates and registers AuthContext in request container
   * 2. SessionVerificationMiddleware - Verifies session and populates AuthContext with userId
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthContextMiddleware)
      .forRoutes('*')

    consumer
      .apply(SessionVerificationMiddleware)
      .forRoutes('*')
  }

  /**
   * Configure AuthModule with async options factory
   */
  static withRootAsync<TOptions extends BetterAuthOptions>(
    options: AsyncModuleOptions<TOptions>
  ): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        {
          provide: AUTH_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject
        },
        {
          provide: AUTH_SERVICE,
          useClass: AuthService
        }
      ]
    }
  }
}
