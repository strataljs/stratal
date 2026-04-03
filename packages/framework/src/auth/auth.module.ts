/**
 * Auth Module
 *
 * Provides configurable authentication using Better Auth.
 * Use `forRootAsync` to configure Better Auth options from the application layer.
 *
 * Optionally pass `accessControl` to enable permission-based authorization.
 * This auto-adds the Stratal AC plugin to Better Auth and registers `AccessService`.
 *
 * @example Without access control
 * ```typescript
 * @Module({
 *   imports: [
 *     AuthModule.forRootAsync({
 *       inject: [DI_TOKENS.Database, CONFIG_TOKENS.ConfigService],
 *       useFactory: (db, config) => createAuthOptions(db, config)
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 *
 * @example With access control
 * ```typescript
 * import { createAccessControl } from '@stratal/framework/access-control'
 * import { admin } from 'better-auth/plugins'
 *
 * const permissions = createAccessControl({
 *   resources: { posts: ['create', 'read', 'update', 'delete'] } as const,
 *   roles: { admin: { posts: ['create', 'read', 'update', 'delete'] }, user: { posts: ['read'] } },
 * })
 *
 * @Module({
 *   imports: [
 *     AuthModule.forRootAsync({
 *       inject: [DI_TOKENS.Database],
 *       useFactory: (db) => ({
 *         database: ...,
 *         plugins: [admin({ ...permissions })],
 *       }),
 *       accessControl: permissions,
 *     })
 *   ]
 * })
 * ```
 */

import type { BetterAuthOptions } from 'better-auth'
import type { RouteConfigurable, Router } from 'stratal/router'
import { Module } from 'stratal/module'
import type { AsyncModuleOptions, DynamicModule } from 'stratal/module'
import { AccessService } from '../access-control/services/access.service'
import { createStratalAcPlugin } from '../access-control/plugin'
import { AC_TOKENS } from '../access-control/tokens'
import type { AccessControlOptions } from '../access-control/types'
import { AUTH_OPTIONS, AUTH_SERVICE } from './auth.tokens'
import { AuthContextMiddleware } from './middleware/auth-context.middleware'
import { SessionVerificationMiddleware } from './middleware/session-verification.middleware'
import { AuthService } from './services/auth.service'

export interface AuthModuleAsyncOptions<TOptions extends BetterAuthOptions = BetterAuthOptions>
  extends AsyncModuleOptions<TOptions> {
  /**
   * Optional access control configuration.
   * When provided, registers AccessService and auto-adds the Stratal AC plugin to Better Auth.
   */
  accessControl?: AccessControlOptions
}

@Module({
  providers: []
})
export class AuthModule implements RouteConfigurable {
  /**
   * Configure auth middleware globally.
   *
   * Registers middlewares in order:
   * 1. AuthContextMiddleware - Creates and registers AuthContext in request container
   * 2. SessionVerificationMiddleware - Verifies session and populates AuthContext with userId + role
   */
  configureRoutes(router: Router): void {
    router.use(AuthContextMiddleware, SessionVerificationMiddleware)
  }

  /**
   * Configure AuthModule with async options factory.
   * Optionally provide `accessControl` to enable permission-based authorization.
   */
  static forRootAsync<TOptions extends BetterAuthOptions>(
    options: AuthModuleAsyncOptions<TOptions>
  ): DynamicModule {
    const { accessControl } = options

    const authOptionsProvider = accessControl
      ? {
          provide: AUTH_OPTIONS,
          useFactory: (...deps: unknown[]) => {
            const raw = (options.useFactory as (...args: unknown[]) => TOptions)(...deps) as BetterAuthOptions
            return {
              ...raw,
              plugins: [createStratalAcPlugin(accessControl), ...(raw.plugins ?? [])],
            }
          },
          inject: options.inject,
        }
      : {
          provide: AUTH_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject,
        }

    return {
      module: AuthModule,
      providers: [
        authOptionsProvider,
        {
          provide: AUTH_SERVICE,
          useClass: AuthService,
        },
        ...(accessControl
          ? [
              { provide: AC_TOKENS.Options, useValue: accessControl as unknown as object },
              { provide: AC_TOKENS.AccessService, useClass: AccessService },
            ]
          : []),
      ],
    }
  }
}
