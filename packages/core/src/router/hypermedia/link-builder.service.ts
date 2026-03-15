import type { Constructor } from '../../types'
import { HTTP_METHODS, ROUTER_CONTEXT_KEYS, VERSION_NEUTRAL } from '../constants'
import { getControllerRoute, getControllerVersion } from '../decorators/controller.decorator'
import { getHttpRouteMetadata } from '../decorators/http-method.decorator'
import { getDecoratedMethods } from '../decorators/route.decorator'
import type { RouterContext } from '../router-context'
import type { VersioningOptions } from '../types'
import {
  type HypermediaLink,
  type LinkMap,
  type MethodNames,
  type PaginationLinkContext,
  RESOURCE_LINK_MAPPING,
  isConstructor,
} from './types'

/**
 * Builds hypermedia links for resource responses.
 *
 * Accessible via `ctx.links` on RouterContext. Resolves URLs from controller
 * route metadata (reverse routing) — no path duplication needed.
 *
 * @example
 * ```typescript
 * // Self link from current request URL
 * ctx.links.self()
 *
 * // Auto-generate CRUD links for current controller
 * ctx.links.resource({ id: user.id })
 *
 * // Link to a specific controller method
 * ctx.links.action(UsersController, 'show', { id: user.id })
 *
 * // Pagination links
 * ctx.links.collection({ page, limit, total, totalPages })
 * ```
 */
export class LinkBuilder {
  private baseUrl: string

  constructor(
    private ctx: RouterContext,
    private versioningOptions: VersioningOptions | null = null,
  ) {
    const url = new URL(this.ctx.c.req.url)
    this.baseUrl = url.origin
  }

  /**
   * Self link from the current request URL
   */
  self(): HypermediaLink {
    const url = new URL(this.ctx.c.req.url)
    return { href: url.pathname + url.search }
  }

  /**
   * Link to a specific controller method
   *
   * @overload Current controller — pass type as generic for autocomplete
   * @overload Explicit controller — method names auto-inferred from class
   */
  action<T>(methodName: MethodNames<T>, params?: Record<string, string>): HypermediaLink
  action<T extends Constructor>(controller: T, methodName: MethodNames<InstanceType<T>>, params?: Record<string, string>): HypermediaLink
  action(
    controllerOrMethodName: Constructor | string,
    methodNameOrParams?: string | Record<string, string>,
    maybeParams?: Record<string, string>
  ): HypermediaLink {
    let controller: Constructor
    let methodName: string
    let params: Record<string, string> | undefined

    if (isConstructor(controllerOrMethodName)) {
      controller = controllerOrMethodName
      methodName = methodNameOrParams as string
      params = maybeParams
    } else {
      controller = this.getCurrentController()
      methodName = controllerOrMethodName
      params = methodNameOrParams as Record<string, string> | undefined
    }

    const path = this.resolveMethodPath(controller, methodName)
    const href = this.interpolateParams(path, params)
    const method = this.resolveHttpMethod(controller, methodName)

    return method === 'GET' ? { href } : { href, method }
  }

  /**
   * Auto-generate CRUD links based on which methods exist on the controller
   *
   * @overload Current controller
   * @overload Explicit controller
   */
  resource(params?: Record<string, string>): LinkMap
  resource(controller: Constructor, params?: Record<string, string>): LinkMap
  resource(
    controllerOrParams?: Constructor | Record<string, string>,
    maybeParams?: Record<string, string>
  ): LinkMap {
    let controller: Constructor
    let params: Record<string, string> | undefined

    if (controllerOrParams && isConstructor(controllerOrParams)) {
      controller = controllerOrParams
      params = maybeParams
    } else {
      controller = this.getCurrentController()
      params = controllerOrParams
    }

    const prototype = controller.prototype as Record<string, unknown>
    const links: LinkMap = {} as LinkMap

    for (const [methodName, mapping] of Object.entries(RESOURCE_LINK_MAPPING)) {
      if (typeof prototype[methodName] === 'function') {
        const path = this.resolveControllerPath(controller) + HTTP_METHODS[methodName as keyof typeof HTTP_METHODS].path
        const href = this.interpolateParams(path, params)
        const link: HypermediaLink = mapping.method === 'GET' ? { href } : { href, method: mapping.method }
        links[mapping.relation as keyof LinkMap] = link
      }
    }

    return links
  }

  /**
   * Auto-generate pagination links (self, first, last, next?, prev?)
   *
   * @overload Current controller
   * @overload Explicit controller
   */
  collection(pagination: PaginationLinkContext, query?: Record<string, string>): LinkMap
  collection(controller: Constructor, pagination: PaginationLinkContext, query?: Record<string, string>): LinkMap
  collection(
    controllerOrPagination: Constructor | PaginationLinkContext,
    paginationOrQuery?: PaginationLinkContext | Record<string, string>,
    maybeQuery?: Record<string, string>
  ): LinkMap {
    let controller: Constructor
    let pagination: PaginationLinkContext
    let query: Record<string, string> | undefined

    if (isConstructor(controllerOrPagination)) {
      controller = controllerOrPagination
      pagination = paginationOrQuery as PaginationLinkContext
      query = maybeQuery
    } else {
      controller = this.getCurrentController()
      pagination = controllerOrPagination
      query = paginationOrQuery as Record<string, string> | undefined
    }

    const basePath = this.resolveControllerPath(controller)
    const links: LinkMap = {} as LinkMap

    const buildHref = (page: number): string => {
      const params = new URLSearchParams({ ...query, page: String(page), limit: String(pagination.limit) })
      return `${basePath}?${params.toString()}`
    }

    links.self = { href: buildHref(pagination.page) }
    links.first = { href: buildHref(1) }
    links.last = { href: buildHref(pagination.totalPages) }

    if (pagination.page < pagination.totalPages) {
      links.next = { href: buildHref(pagination.page + 1) }
    }
    if (pagination.page > 1) {
      links.prev = { href: buildHref(pagination.page - 1) }
    }

    return links
  }

  /**
   * Low-level: build a link from an explicit path with `:param` interpolation
   */
  link(path: string, params?: Record<string, string>, method?: string): HypermediaLink {
    const href = this.interpolateParams(path, params)
    return method && method !== 'GET' ? { href, method } : { href }
  }

  /**
   * Get the current controller class from the Hono context
   */
  private getCurrentController(): Constructor {
    const controller = this.ctx.c.get(ROUTER_CONTEXT_KEYS.CURRENT_CONTROLLER)
    if (!controller) {
      throw new Error('Cannot determine current controller. Pass the controller class explicitly or ensure CURRENT_CONTROLLER is set on the context.')
    }
    return controller
  }

  /**
   * Resolve the full path for a controller (with versioning)
   */
  private resolveControllerPath(controller: Constructor): string {
    const basePath = getControllerRoute(controller)
    if (!basePath) {
      throw new Error(`Controller ${controller.name} has no @Controller route metadata`)
    }
    return this.applyVersionPrefix(basePath, controller)
  }

  /**
   * Resolve the full path for a specific method on a controller
   */
  private resolveMethodPath(controller: Constructor, methodName: string): string {
    const basePath = this.resolveControllerPath(controller)
    const prototype = controller.prototype as object

    // Check HTTP method decorators first (@Get, @Post, etc.)
    const httpMeta = getHttpRouteMetadata(prototype, methodName)
    if (httpMeta) {
      return httpMeta.path === '/' ? basePath : basePath + httpMeta.path
    }

    // Check @Route decorator (convention-based)
    const decoratedMethods = getDecoratedMethods(controller)
    if (decoratedMethods.includes(methodName) && methodName in HTTP_METHODS) {
      return basePath + HTTP_METHODS[methodName as keyof typeof HTTP_METHODS].path
    }

    // Check plain RESTful methods (no decorator)
    if (methodName in HTTP_METHODS) {
      return basePath + HTTP_METHODS[methodName as keyof typeof HTTP_METHODS].path
    }

    throw new Error(`Cannot resolve path for ${controller.name}.${methodName} — no route metadata found`)
  }

  /**
   * Resolve the HTTP method for a specific controller method
   */
  private resolveHttpMethod(controller: Constructor, methodName: string): string {
    const prototype = controller.prototype as object

    // Check HTTP method decorators first
    const httpMeta = getHttpRouteMetadata(prototype, methodName)
    if (httpMeta) {
      return httpMeta.method.toUpperCase()
    }

    // Convention-based
    if (methodName in HTTP_METHODS) {
      return HTTP_METHODS[methodName as keyof typeof HTTP_METHODS].method.toUpperCase()
    }

    return 'GET'
  }

  /**
   * Apply version prefix to a path based on versioning configuration
   */
  private applyVersionPrefix(basePath: string, controller: Constructor): string {
    if (!this.versioningOptions) return basePath

    const version = getControllerVersion(controller)
    if (version === VERSION_NEUTRAL) return basePath

    const prefix = this.versioningOptions.prefix ?? 'v'

    if (version !== undefined) {
      const v = Array.isArray(version) ? version[0] : version
      return `/${prefix}${v}${basePath}`
    }

    if (this.versioningOptions.defaultVersion !== undefined) {
      const v = Array.isArray(this.versioningOptions.defaultVersion)
        ? this.versioningOptions.defaultVersion[0]
        : this.versioningOptions.defaultVersion
      return `/${prefix}${v}${basePath}`
    }

    return basePath
  }

  /**
   * Replace `:param` placeholders with actual values
   */
  private interpolateParams(path: string, params?: Record<string, string>): string {
    if (!params) return path
    return Object.entries(params).reduce(
      (result, [key, value]) => result.replace(`:${key}`, value),
      path
    )
  }
}
