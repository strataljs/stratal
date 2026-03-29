import type { ZodObject } from '../i18n/validation'
import type { Constructor } from '../types'
import { RouterUseScopeError } from './errors/router-use-scope.error'
import type { Middleware } from './middleware.interface'
import * as internal from './router.internals'

/**
 * Configuration for a sub-group created via `router.group()`.
 */
export interface RouterGroupConfig {
  prefix?: string
  domain?: string
  name?: string
  middleware?: Constructor<Middleware>[]
  version?: string | string[]
  hideFromDocs?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ZodObject generics require any for flexible shape parameter
  params?: ZodObject<any>
}

/**
 * Internal entry representing a sub-group or the default scope.
 * @internal — used by RouterResolver, not exported publicly.
 */
export interface RouterEntry {
  prefix?: string
  domain?: string
  name?: string
  middleware: Constructor<Middleware>[]
  version?: string | string[]
  hideFromDocs?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ZodObject generics require any for flexible shape parameter
  params?: ZodObject<any>
  /** Controllers in this entry. undefined = all controllers not in any sub-group */
  controllers?: Constructor[]
}

/**
 * Modules implement this to configure routes and middleware.
 * Replaces `MiddlewareConfigurable`.
 *
 * @example
 * ```typescript
 * @Module({ controllers: [UsersController, PostsController] })
 * export class ApiModule implements RouteConfigurable {
 *   configureRoutes(router: Router): void {
 *     router
 *       .name('api.')
 *       .middleware(CorsMiddleware)
 *       .version('1')
 *   }
 * }
 * ```
 */
export interface RouteConfigurable {
  configureRoutes(router: Router): void
}

/**
 * Fluent builder for route and middleware configuration.
 *
 * Scoped methods (`middleware()`, `prefix()`, `domain()`, `name()`, `version()`, `hideFromDocs()`)
 * apply only to this module's controllers or the sub-group's controllers.
 *
 * `use()` registers global middleware (all routes in the entire app).
 * Only callable on the root Router — throws inside `group()` callbacks.
 *
 * `group()` creates sub-groups for specific controllers with a callback.
 * Controllers in a sub-group are excluded from the parent scope.
 */
export class Router {
  private readonly _isChild: boolean
  private readonly _defaultEntry: RouterEntry = { middleware: [] }
  private readonly _groups: RouterEntry[] = []
  private readonly _globalMiddleware: Constructor<Middleware>[] = []

  constructor(isChild = false) {
    this._isChild = isChild
  }

  /** Dynamic path prefix. For shared segments like `/:companyId` */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ZodObject generics require any for flexible shape parameter
  prefix(path: string, params?: ZodObject<any>): this {
    this._defaultEntry.prefix = path
    this._defaultEntry.params = params
    return this
  }

  /** Domain pattern for controllers in this scope */
  domain(pattern: string): this {
    this._defaultEntry.domain = pattern
    return this
  }

  /** Name prefix for routes in this scope */
  name(prefix: string): this {
    this._defaultEntry.name = prefix
    return this
  }

  /** Middleware applied to controllers in this scope */
  middleware(...middlewares: Constructor<Middleware>[]): this {
    this._defaultEntry.middleware.push(...middlewares)
    return this
  }

  /** API version for controllers in this scope */
  version(version: string | string[]): this {
    this._defaultEntry.version = version
    return this
  }

  /** Hide/show routes in this scope from OpenAPI docs */
  hideFromDocs(hide = true): this {
    this._defaultEntry.hideFromDocs = hide
    return this
  }

  /**
   * Global middleware — applied to ALL routes in the entire app.
   * Only callable on the root Router. Throws if called inside `group()`.
   */
  use(...middlewares: Constructor<Middleware>[]): this {
    if (this._isChild) {
      throw new RouterUseScopeError()
    }
    this._globalMiddleware.push(...middlewares)
    return this
  }

  /**
   * Create a sub-group for specific controllers/gateways.
   * Controllers in a sub-group are excluded from the parent (default) scope.
   * The callback receives a new Router (without `use()`) for fluent configuration.
   */
  group(controllers: Constructor[], callback: (router: Omit<Router, 'use'>) => void): this {
    const childRouter = new Router(true)
    callback(childRouter)

    this._groups.push({
      ...childRouter._defaultEntry,
      controllers,
    })
    return this
  }

  // --- Internal accessors via symbol keys (invisible to consumers) ---

  [internal.getDefaultEntry](): RouterEntry {
    return this._defaultEntry
  }

  [internal.getGroups](): RouterEntry[] {
    return this._groups
  }

  [internal.getGlobalMiddleware](): Constructor<Middleware>[] {
    return this._globalMiddleware
  }
}
