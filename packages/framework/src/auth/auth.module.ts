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
import { CONTAINER_TOKEN, type Container } from 'stratal/di'
import type { AsyncModuleOptions, DynamicModule } from 'stratal/module'
import { Module } from 'stratal/module'
import type { IRateLimiterStore, RateLimiterRegistry } from 'stratal/rate-limiter'
import { RATE_LIMITER_TOKENS } from 'stratal/rate-limiter'
import type { RouteConfigurable, Router } from 'stratal/router'
import { AccessShareMiddleware } from '../access-control/access-share.middleware'
import { createStratalAcPlugin } from '../access-control/plugin'
import { AccessService } from '../access-control/services/access.service'
import { AC_TOKENS } from '../access-control/tokens'
import type { AccessControlOptions } from '../access-control/types'
import { AuthContext } from '../context/auth-context'
// Side-effect import: registers the `user()` macro on `RouterContext` and its
// type augmentation, backed by the request-scoped `AuthContext`.
import '../context/router-context.augment'
import { AUTH_OPTIONS, AUTH_SERVICE } from './auth.tokens'
import { SessionVerificationMiddleware } from './middleware/session-verification.middleware'
// Side-effect import: registers `forPath`/`pathEntries` macros on
// `RateLimiterRegistry` and the `declare module` augmentation that exposes
// them at the type level. Must run before any consumer calls `forPath()`.
import {
  createBetterAuthRateLimitStorage,
  projectCustomRules,
} from './rate-limit-bridge'
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
  providers: [AuthContext]
})
export class AuthModule implements RouteConfigurable {
  /**
   * Configure auth middleware globally.
   *
   * SessionVerificationMiddleware verifies the session and populates the
   * request-scoped AuthContext with the authenticated user.
   *
   * AccessShareMiddleware then shares the resulting roles and permissions to
   * Inertia. Order matters: it reads what session verification wrote. Both
   * no-op when their dependencies are absent.
   */
  configureRoutes(router: Router): void {
    router.use(SessionVerificationMiddleware)
    router.use(AccessShareMiddleware)
  }

  /**
   * Configure AuthModule with async options factory.
   * Optionally provide `accessControl` to enable permission-based authorization.
   *
   * When `RateLimiterModule` is also imported, better-auth's `rateLimit`
   * block is auto-wired: `customStorage` shares Stratal's backing store, and
   * any `RateLimiterRegistry.forPath(...)` entries are projected into
   * `customRules`. User-supplied `rateLimit.{customStorage, customRules}` keys
   * take precedence on a per-key basis.
   */
  static forRootAsync<TOptions extends BetterAuthOptions>(
    options: AuthModuleAsyncOptions<TOptions>
  ): DynamicModule {
    const { accessControl } = options
    const userInject = options.inject ?? []
    const userFactory = options.useFactory as (...args: unknown[]) => TOptions

    const authOptionsProvider = {
      provide: AUTH_OPTIONS,
      useFactory: (container: Container, ...userDeps: unknown[]): BetterAuthOptions => {
        let raw = userFactory(...userDeps) as BetterAuthOptions

        if (accessControl) {
          raw = {
            ...raw,
            plugins: [createStratalAcPlugin(accessControl), ...(raw.plugins ?? [])],
          }
        }

        const rateLimiterPresent = container.isRegistered(
          RATE_LIMITER_TOKENS.ModuleMarker,
        )

        if (rateLimiterPresent) {
          const store = container.resolve<IRateLimiterStore>(RATE_LIMITER_TOKENS.Store)
          const registry = container.resolve<RateLimiterRegistry>(RATE_LIMITER_TOKENS.Registry)

          raw = {
            ...raw,
            rateLimit: {
              enabled: true,
              ...raw.rateLimit,
              customStorage: raw.rateLimit?.customStorage ?? createBetterAuthRateLimitStorage(store),
              customRules: {
                ...projectCustomRules(registry),
                ...(raw.rateLimit?.customRules ?? {}),
              },
            },
          }
        }

        return raw
      },
      inject: [CONTAINER_TOKEN, ...userInject],
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
