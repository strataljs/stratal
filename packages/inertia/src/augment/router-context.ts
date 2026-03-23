import { RouterContext } from 'stratal/router'
import type { InertiaService } from '../services/inertia.service'
import type {
  InertiaDeferredProp,
  InertiaMergeProp,
  InertiaOptionalProp,
  InertiaPageComponent,
  InertiaPageRegistry,
  InertiaRenderOptions,
  ResolvedInertiaPageProps,
} from '../types'

declare module 'stratal/router' {
  interface RouterContext {
    inertia<C extends InertiaPageComponent>(
      component: C,
      ...args: keyof InertiaPageRegistry extends never
        ? [props?: Record<string, unknown>, options?: InertiaRenderOptions]
        : Record<string, never> extends ResolvedInertiaPageProps<C>
          ? [props?: ResolvedInertiaPageProps<C>, options?: InertiaRenderOptions]
          : [props: ResolvedInertiaPageProps<C>, options?: InertiaRenderOptions]
    ): Promise<Response>
    defer(callback: () => unknown, group?: string): InertiaDeferredProp
    optional(callback: () => unknown): InertiaOptionalProp
    merge(callback: () => unknown): InertiaMergeProp
  }
}

export function augmentRouterContext(resolveService: (ctx: RouterContext) => InertiaService): void {
  const proto = RouterContext.prototype

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.inertia = function (this: RouterContext, component: string, props?: any, options?: InertiaRenderOptions) {
    const service = resolveService(this)
    return service.render(this, component, props, options)
  }

  proto.defer = function (this: RouterContext, callback: () => unknown, group?: string) {
    const service = resolveService(this)
    return service.defer(callback, group)
  }

  proto.optional = function (this: RouterContext, callback: () => unknown) {
    const service = resolveService(this)
    return service.optional(callback)
  }

  proto.merge = function (this: RouterContext, callback: () => unknown) {
    const service = resolveService(this)
    return service.merge(callback)
  }
}
