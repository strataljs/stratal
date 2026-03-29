import type { RedirectStatusCode } from 'hono/utils/http-status'
import { RouterContext } from 'stratal/router'
import type { InertiaService } from '../services/inertia.service'
import type {
  InertiaAlwaysProp,
  InertiaDeferredProp,
  InertiaMergeProp,
  InertiaMergeStrategy,
  InertiaOnceProp,
  InertiaOptionalProp,
  InertiaPageComponent,
  InertiaPageRegistry,
  InertiaRenderOptions,
  ResolvedInertiaPageProps,
} from '../types'

export interface InertiaMergeOptions {
  strategy?: InertiaMergeStrategy
  matchOn?: string
}

export interface InertiaOnceOptions {
  expiresAt?: number | null
  key?: string
}

declare module 'stratal/router' {
  interface RouterContext {
    /** Renders an Inertia page component with the given props and returns an HTTP response. */
    inertia<C extends InertiaPageComponent>(
      component: C,
      ...args: keyof InertiaPageRegistry extends never
        ? [props?: Record<string, unknown>, options?: InertiaRenderOptions]
        : Record<string, never> extends ResolvedInertiaPageProps<C>
        ? [props?: ResolvedInertiaPageProps<C>, options?: InertiaRenderOptions]
        : [props: ResolvedInertiaPageProps<C>, options?: InertiaRenderOptions]
    ): Promise<Response>
    /** Creates a deferred prop that is resolved after the initial page render, optionally grouped for batch loading. */
    defer<T>(callback: () => T, group?: string): InertiaDeferredProp<T>
    /** Creates an optional prop that is only included in the response when explicitly requested by the client. */
    optional<T>(callback: () => T): InertiaOptionalProp<T>
    /** Creates a mergeable prop that merges with existing client-side page data instead of replacing it. */
    merge<T>(callback: () => T, options?: InertiaMergeOptions): InertiaMergeProp<T>
    /** Creates a prop that is only sent on the first visit and cached for subsequent requests. */
    once<T>(callback: () => T, options?: InertiaOnceOptions): InertiaOnceProp<T>
    /** Creates a prop that is always evaluated and included, even on partial reload requests. */
    always<T>(callback: () => T): InertiaAlwaysProp<T>
    /** Sets a flash data entry that will be available on the next page visit. */
    flash(key: string, value: unknown): void
    /** Disables server-side rendering for the current request. */
    withoutSsr(): void
  }
}

export function augmentRouterContext(resolveService: (ctx: RouterContext) => InertiaService): void {
  const proto = RouterContext.prototype

  // Override redirect to auto-convert 302 → 303 for non-GET/HEAD requests
  // so the browser follows with GET instead of preserving the original method
  // eslint-disable-next-line @typescript-eslint/unbound-method -- intentionally saving reference, called with .call(this)
  const originalRedirect = proto.redirect
  proto.redirect = function (this: RouterContext, url: string, status?: RedirectStatusCode) {
    if (!status || status === 302) {
      const method = this.c.req.method
      if (method !== 'GET' && method !== 'HEAD') {
        return originalRedirect.call(this, url, 303)
      }
    }
    return originalRedirect.call(this, url, status)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.inertia = function (this: RouterContext, component: string, props?: any, options?: InertiaRenderOptions) {
    const service = resolveService(this)
    return service.render(this, component, props as Record<string, unknown>, options)
  }

  proto.defer = function <T>(this: RouterContext, callback: () => T, group?: string) {
    const service = resolveService(this)
    return service.defer(callback, group)
  }

  proto.optional = function <T>(this: RouterContext, callback: () => T) {
    const service = resolveService(this)
    return service.optional(callback)
  }

  proto.merge = function <T>(this: RouterContext, callback: () => T, options?: InertiaMergeOptions) {
    const service = resolveService(this)
    return service.merge(callback, options)
  }

  proto.once = function <T>(this: RouterContext, callback: () => T, options?: InertiaOnceOptions) {
    const service = resolveService(this)
    return service.once(callback, options)
  }

  proto.always = function <T>(this: RouterContext, callback: () => T) {
    const service = resolveService(this)
    return service.always(callback)
  }

  proto.flash = function (this: RouterContext, key: string, value: unknown) {
    const flashOut = this.c.get('inertiaFlashOut') as Record<string, unknown> | undefined
    if (flashOut) {
      flashOut[key] = value
    }
  }

  proto.withoutSsr = function (this: RouterContext) {
    this.c.set('withoutSsr', true)
  }
}
