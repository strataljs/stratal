import { Transient, inject } from 'stratal/di'
import type { RouterContext } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type {
  InertiaDeferredProp,
  InertiaMergeProp,
  InertiaOptionalProp,
  InertiaPage,
  InertiaRenderOptions,
  SharedDataResolver,
} from '../types'
import {
  INERTIA_PROP_DEFERRED,
  INERTIA_PROP_MERGE,
  INERTIA_PROP_OPTIONAL,
} from '../types'
import type { SsrRendererService } from './ssr-renderer.service'
import type { TemplateService } from './template.service'

@Transient()
export class InertiaService {
  private sharedData: Record<string, unknown> = {}

  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
    @inject(INERTIA_TOKENS.TemplateService) private readonly template: TemplateService,
    @inject(INERTIA_TOKENS.SsrRenderer) private readonly ssr: SsrRendererService,
  ) { }

  share(key: string, value: unknown): void {
    this.sharedData[key] = value
  }

  location(url: string): Response {
    return new Response('', {
      status: 409,
      headers: { 'X-Inertia-Location': url },
    })
  }

  optional(callback: () => unknown): InertiaOptionalProp {
    return { [INERTIA_PROP_OPTIONAL]: true, callback }
  }

  defer(callback: () => unknown, group = 'default'): InertiaDeferredProp {
    return { [INERTIA_PROP_DEFERRED]: true, callback, group }
  }

  merge(callback: () => unknown): InertiaMergeProp {
    return { [INERTIA_PROP_MERGE]: true, callback }
  }

  async render(
    ctx: RouterContext,
    component: string,
    props: Record<string, unknown> = {},
    renderOptions: InertiaRenderOptions = {},
  ): Promise<Response> {
    const url = new URL(ctx.c.req.url).pathname
    const isInertia = ctx.c.get('inertia')

    // Resolve shared data from module options
    const resolvedShared = this.resolveSharedData(ctx)

    // Merge shared data with route props
    const allProps = { ...resolvedShared, ...this.sharedData, ...props }

    // Process props: handle optional, deferred, merge
    const { resolvedProps, mergeProps, deferredProps } = await this.processProps(
      allProps,
      ctx,
      component,
      isInertia,
    )

    const page: InertiaPage = {
      component,
      props: resolvedProps,
      url,
      version: this.options.version ?? '',
      mergeProps,
      deferredProps,
      encryptHistory: renderOptions.encryptHistory ?? false,
      clearHistory: renderOptions.clearHistory ?? false,
    }

    if (isInertia) {
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Inertia': 'true',
          'Vary': 'X-Inertia',
        },
      })
    }

    // Full page render with SSR
    const ssrResult = await this.ssr.render(page)
    const html = this.template.render(page, ssrResult.head, ssrResult.body)

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  }

  private resolveSharedData(ctx: RouterContext): Record<string, unknown> {
    const shared: Record<string, unknown> = {}
    const configShared = this.options.sharedData

    if (!configShared) return shared

    for (const [key, value] of Object.entries(configShared)) {
      if (typeof value === 'function') {
        shared[key] = (value as SharedDataResolver)(ctx)
      } else {
        shared[key] = value
      }
    }

    return shared
  }

  private async processProps(
    allProps: Record<string, unknown>,
    ctx: RouterContext,
    component: string,
    isInertia: boolean,
  ): Promise<{
    resolvedProps: Record<string, unknown>
    mergeProps: string[]
    deferredProps: Record<string, string[]>
  }> {
    const resolvedProps: Record<string, unknown> = {}
    const mergeProps: string[] = []
    const deferredProps: Record<string, string[]> = {}

    const partialComponent = ctx.header('x-inertia-partial-component')
    const partialDataHeader = ctx.header('x-inertia-partial-data')
    const isPartialReload = isInertia && partialComponent === component && partialDataHeader

    const requestedProps = partialDataHeader?.split(',').map((s) => s.trim()) ?? []

    for (const [key, value] of Object.entries(allProps)) {
      // Handle deferred props
      if (this.isDeferredProp(value)) {
        if (isPartialReload && requestedProps.includes(key)) {
          resolvedProps[key] = await value.callback()
        } else if (!isPartialReload) {
          deferredProps[value.group] ??= []
          deferredProps[value.group].push(key)
        }
        continue
      }

      // Handle merge props
      if (this.isMergeProp(value)) {
        if (isPartialReload && !requestedProps.includes(key)) {
          continue
        }
        mergeProps.push(key)
        resolvedProps[key] = await value.callback()
        continue
      }

      // Handle optional props
      if (this.isOptionalProp(value)) {
        // Only include on partial reloads when explicitly requested
        if (isPartialReload && requestedProps.includes(key)) {
          resolvedProps[key] = await value.callback()
        }
        continue
      }

      // Regular props
      if (isPartialReload) {
        // On partial reload, only include requested props
        if (requestedProps.includes(key)) {
          resolvedProps[key] = value
        }
      } else {
        resolvedProps[key] = value
      }
    }

    return { resolvedProps, mergeProps, deferredProps }
  }

  private isOptionalProp(value: unknown): value is InertiaOptionalProp {
    return typeof value === 'object' && value !== null && INERTIA_PROP_OPTIONAL in value
  }

  private isDeferredProp(value: unknown): value is InertiaDeferredProp {
    return typeof value === 'object' && value !== null && INERTIA_PROP_DEFERRED in value
  }

  private isMergeProp(value: unknown): value is InertiaMergeProp {
    return typeof value === 'object' && value !== null && INERTIA_PROP_MERGE in value
  }
}
