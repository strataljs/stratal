import type { ZodObject } from '../i18n/validation/zod'
import type { Constructor } from '../types'
import type { Middleware } from './middleware.interface'
import type { Router, RouterEntry } from './router'
import * as internal from './router.internals'

/**
 * Resolved configuration for a single controller.
 * Merges Router default entry, sub-group overrides, and inheritance rules.
 */
export interface ResolvedRouterConfig {
  prefix?: string
  domain?: string
  name?: string
  middleware: Constructor<Middleware>[]
  version?: string | string[]
  hideFromDocs?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ZodObject generics require any for flexible shape parameter
  params?: ZodObject<any>
}

/**
 * Internal resolver that computes the effective Router config for each controller.
 *
 * Inheritance rules:
 * - `middleware`: parent middleware runs first, then child (concatenated)
 * - `prefix`: concatenated (parent + child)
 * - `name`: concatenated (parent + child)
 * - `domain`: child overrides parent
 * - `version`: child overrides parent
 * - `hideFromDocs`: child overrides parent
 *
 * @internal — not exported from stratal/router
 */
export class RouterResolver {
  private readonly routers: { router: Router; controllers: Constructor[] }[]

  constructor(routers: { router: Router; controllers: Constructor[] }[]) {
    this.routers = routers
  }

  /**
   * Resolve the effective config for a given controller class.
   * Searches through all module routers to find the one owning this controller.
   */
  resolveForController(controller: Constructor): ResolvedRouterConfig {
    for (const { router, controllers: moduleControllers } of this.routers) {
      if (!moduleControllers.includes(controller)) continue

      // Check if controller is in a sub-group
      for (const group of router[internal.getGroups]()) {
        if (group.controllers?.includes(controller)) {
          return this.mergeEntries(router[internal.getDefaultEntry](), group)
        }
      }

      // Controller is in the default scope (not in any sub-group)
      // But only if it's not claimed by any sub-group in this module
      const groupedControllers = new Set(
        router[internal.getGroups]().flatMap(g => g.controllers ?? [])
      )
      if (!groupedControllers.has(controller)) {
        return this.entryToConfig(router[internal.getDefaultEntry]())
      }
    }

    // Controller not found in any module's router — return empty config
    return { middleware: [] }
  }

  /**
   * Collect all global middleware registered via `router.use()` across all modules.
   */
  getGlobalMiddleware(): Constructor<Middleware>[] {
    const global: Constructor<Middleware>[] = []
    for (const { router } of this.routers) {
      global.push(...router[internal.getGlobalMiddleware]())
    }
    return global
  }

  /**
   * Merge parent default entry with child group entry following inheritance rules.
   */
  private mergeEntries(parent: RouterEntry, child: RouterEntry): ResolvedRouterConfig {
    return {
      // Concatenate: parent prefix + child prefix
      prefix: this.concatPrefixes(parent.prefix, child.prefix),
      // Override: child domain wins
      domain: child.domain ?? parent.domain,
      // Concatenate: parent name + child name
      name: this.concatNames(parent.name, child.name),
      // Concatenate: parent middleware first, then child
      middleware: [...parent.middleware, ...child.middleware],
      // Override: child version wins
      version: child.version ?? parent.version,
      // Override: child hideFromDocs wins
      hideFromDocs: child.hideFromDocs ?? parent.hideFromDocs,
      // Extend: parent params extended with child params
      params: this.mergeParams(parent.params, child.params),
    }
  }

  private entryToConfig(entry: RouterEntry): ResolvedRouterConfig {
    return {
      prefix: entry.prefix,
      domain: entry.domain,
      name: entry.name,
      middleware: [...entry.middleware],
      version: entry.version,
      hideFromDocs: entry.hideFromDocs,
      params: entry.params,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ZodObject generics require any for flexible shape parameter
  private mergeParams(parent?: ZodObject<any>, child?: ZodObject<any>): ZodObject<any> | undefined {
    if (!parent && !child) return undefined
    if (!parent) return child
    if (!child) return parent
    // oxlint-disable-next-line typescript/no-explicit-any
    return parent.extend(child.shape) as ZodObject<any>
  }

  private concatPrefixes(parent?: string, child?: string): string | undefined {
    if (!parent && !child) return undefined
    if (!parent) return child
    if (!child) return parent
    // Normalize: remove trailing slash from parent, ensure child starts with /
    const p = parent.endsWith('/') ? parent.slice(0, -1) : parent
    const c = child.startsWith('/') ? child : `/${child}`
    return `${p}${c}`
  }

  private concatNames(parent?: string, child?: string): string | undefined {
    if (!parent && !child) return undefined
    if (!parent) return child
    if (!child) return parent
    return `${parent}${child}`
  }
}
