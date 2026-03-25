import type { Page } from '@inertiajs/core'
import { Transient, inject } from 'stratal/di'
import { I18N_TOKENS, MessageLoaderService } from 'stratal/i18n'
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
    const resolvedShared = await this.resolveSharedData(ctx)

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
      ...(renderOptions.encryptHistory ? { encryptHistory: true } : {}),
      ...(renderOptions.clearHistory ? { clearHistory: true } : {}),
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

    // Full page render — skip SSR if disabled for this route
    const ssrDisabled = ctx.c.get('withoutSsr') || this.isSsrDisabled(url)
    const ssrResult = ssrDisabled
      ? { head: [] as string[], body: '' }
      : await this.ssr.render(page as unknown as Page)
    const html = this.template.render(page, ssrResult.head, ssrResult.body)

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  }

  /**
   * Resolve shared data from module options and i18n configuration.
   *
   * Processes static values and resolver functions from `sharedData` config.
   * When `i18n` option is set, auto-injects `locale` and `translations` props
   * using the core {@link MessageLoaderService} resolved from the request container.
   */
  private async resolveSharedData(ctx: RouterContext): Promise<Record<string, unknown>> {
    const shared: Record<string, unknown> = {}
    const configShared = this.options.sharedData

    if (configShared) {
      for (const [key, value] of Object.entries(configShared)) {
        if (typeof value === 'function') {
          shared[key] = await (value as SharedDataResolver)(ctx)
        } else {
          shared[key] = value
        }
      }
    }

    if (this.options.i18n) {
      const loader = ctx.getContainer().resolve<MessageLoaderService>(I18N_TOKENS.MessageLoader)
      const locale = ctx.getLocale()
      shared.locale = locale
      shared.translations = loader.getFilteredMessages(locale, { only: this.options.i18n.only })
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
        if (isPartialReload && this.isRequested(key, requestedProps)) {
          resolvedProps[key] = await value.callback()
        } else if (!isPartialReload) {
          deferredProps[value.group] ??= []
          deferredProps[value.group].push(key)
        }
        continue
      }

      // Handle merge props
      if (this.isMergeProp(value)) {
        if (isPartialReload && !this.isRequested(key, requestedProps)) {
          continue
        }
        mergeProps.push(key)
        resolvedProps[key] = await value.callback()
        continue
      }

      // Handle optional props
      if (this.isOptionalProp(value)) {
        // Only include on partial reloads when explicitly requested
        if (isPartialReload && this.isRequested(key, requestedProps)) {
          resolvedProps[key] = await value.callback()
        }
        continue
      }

      // Regular props
      if (isPartialReload) {
        // On partial reload, only include requested props
        if (this.isRequested(key, requestedProps)) {
          resolvedProps[key] = value
        }
      } else {
        resolvedProps[key] = value
      }
    }

    return { resolvedProps, mergeProps, deferredProps }
  }

  /**
   * Check if a prop key is requested — supports dot-notation (e.g., `user.permissions`
   * matches the top-level `user` key).
   */
  private isRequested(key: string, requestedProps: string[]): boolean {
    return requestedProps.some((prop) => prop === key || prop.startsWith(`${key}.`))
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

  private isSsrDisabled(pathname: string): boolean {
    const patterns = this.options.ssr?.disabled
    if (!patterns || patterns.length === 0) return false

    return patterns.some((pattern) => {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`^/${escaped.replace(/\*/g, '[^/]*')}$`)
      return regex.test(pathname)
    })
  }
}
