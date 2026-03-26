import type { Page } from '@inertiajs/core'
import { Transient, inject } from 'stratal/di'
import { I18N_TOKENS, type MessageLoaderService } from 'stratal/i18n'
import type { RouterContext } from 'stratal/router'
import type { InertiaMergeOptions, InertiaOnceOptions } from '../augment/router-context'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type {
  InertiaAlwaysProp,
  InertiaDeferredProp,
  InertiaMergeProp,
  InertiaOnceProp,
  InertiaOptionalProp,
  InertiaRenderOptions,
  SharedDataResolver,
} from '../types'
import {
  INERTIA_PROP_ALWAYS,
  INERTIA_PROP_DEFERRED,
  INERTIA_PROP_MERGE,
  INERTIA_PROP_ONCE,
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

  optional<T>(callback: () => T): InertiaOptionalProp<T> {
    return { [INERTIA_PROP_OPTIONAL]: true, callback }
  }

  defer<T>(callback: () => T, group = 'default'): InertiaDeferredProp<T> {
    return { [INERTIA_PROP_DEFERRED]: true, callback, group }
  }

  merge<T>(callback: () => T, options?: InertiaMergeOptions): InertiaMergeProp<T> {
    return {
      [INERTIA_PROP_MERGE]: true,
      callback,
      strategy: options?.strategy ?? 'append',
      matchOn: options?.matchOn,
    }
  }

  once<T>(callback: () => T, options?: InertiaOnceOptions): InertiaOnceProp<T> {
    return {
      [INERTIA_PROP_ONCE]: true,
      callback,
      expiresAt: options?.expiresAt ?? null,
      key: options?.key,
    }
  }

  always<T>(callback: () => T): InertiaAlwaysProp<T> {
    return { [INERTIA_PROP_ALWAYS]: true, callback }
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
    const { shared: resolvedShared, sharedKeys } = await this.resolveSharedData(ctx)

    // Merge shared data with route props
    const allProps = { ...resolvedShared, ...this.sharedData, ...props }

    // Track all shared prop keys (module config + per-request .share())
    const allSharedKeys = [...sharedKeys, ...Object.keys(this.sharedData)]

    // Process props: handle optional, deferred, merge, once, always
    const result = await this.processProps(allProps, ctx, component, isInertia)

    // Read flash data from context (set by middleware)
    const flash = (ctx.c.get('inertiaFlash') as Record<string, unknown> | undefined) ?? {}

    const page: Page = {
      component,
      props: { ...result.resolvedProps, errors: {} },
      url,
      version: this.options.version ?? null,
      flash,
      rememberedState: {},
      ...(result.mergeProps.length > 0 ? { mergeProps: result.mergeProps } : {}),
      ...(result.prependProps.length > 0 ? { prependProps: result.prependProps } : {}),
      ...(result.deepMergeProps.length > 0 ? { deepMergeProps: result.deepMergeProps } : {}),
      ...(result.matchPropsOn.length > 0 ? { matchPropsOn: result.matchPropsOn } : {}),
      ...(Object.keys(result.deferredProps).length > 0 ? { deferredProps: result.deferredProps } : {}),
      ...(Object.keys(result.deferredProps).length > 0 && !this.isPartialReload(ctx, component) ? { initialDeferredProps: result.deferredProps } : {}),
      ...(Object.keys(result.onceProps).length > 0 ? { onceProps: result.onceProps } : {}),
      ...(allSharedKeys.length > 0 ? { sharedProps: allSharedKeys } : {}),
      ...(renderOptions.encryptHistory ? { encryptHistory: true } : {}),
      ...(renderOptions.clearHistory ? { clearHistory: true } : {}),
      ...(renderOptions.preserveFragment ? { preserveFragment: true } : {}),
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
      : await this.ssr.render(page)
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
  private async resolveSharedData(ctx: RouterContext): Promise<{ shared: Record<string, unknown>; sharedKeys: string[] }> {
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

    return { shared, sharedKeys: Object.keys(shared) }
  }

  private isPartialReload(ctx: RouterContext, component: string): boolean {
    const isInertia = ctx.c.get('inertia')
    const partialComponent = ctx.header('x-inertia-partial-component')
    const partialDataHeader = ctx.header('x-inertia-partial-data')
    return !!(isInertia && partialComponent === component && partialDataHeader)
  }

  private async processProps(
    allProps: Record<string, unknown>,
    ctx: RouterContext,
    component: string,
    isInertia: boolean,
  ): Promise<{
    resolvedProps: Record<string, unknown>
    mergeProps: string[]
    prependProps: string[]
    deepMergeProps: string[]
    matchPropsOn: string[]
    deferredProps: Record<string, string[]>
    onceProps: Record<string, { prop: string; expiresAt?: number | null }>
  }> {
    const resolvedProps: Record<string, unknown> = {}
    const mergeProps: string[] = []
    const prependProps: string[] = []
    const deepMergeProps: string[] = []
    const matchPropsOn: string[] = []
    const deferredProps: Record<string, string[]> = {}
    const onceProps: Record<string, { prop: string; expiresAt?: number | null }> = {}

    const partialComponent = ctx.header('x-inertia-partial-component')
    const partialDataHeader = ctx.header('x-inertia-partial-data')
    const partialExceptHeader = ctx.header('x-inertia-partial-except')
    const resetHeader = ctx.header('x-inertia-reset')
    const isPartialReload = isInertia && partialComponent === component && partialDataHeader

    const requestedProps = partialDataHeader?.split(',').map((s) => s.trim()) ?? []
    const exceptProps = partialExceptHeader?.split(',').map((s) => s.trim()) ?? []
    const _resetProps = resetHeader?.split(',').map((s) => s.trim()) ?? []

    for (const [key, value] of Object.entries(allProps)) {
      // Handle always props — always resolve regardless of partial reload
      if (this.isAlwaysProp(value)) {
        resolvedProps[key] = await value.callback()
        continue
      }

      // Handle once props
      if (this.isOnceProp(value)) {
        if (isPartialReload && this.isRequested(key, requestedProps)) {
          resolvedProps[key] = await value.callback()
        } else if (!isPartialReload) {
          resolvedProps[key] = await value.callback()
          onceProps[key] = {
            prop: value.key ?? key,
            ...(value.expiresAt != null ? { expiresAt: value.expiresAt } : {}),
          }
        }
        continue
      }

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

      // Handle merge props (append/prepend/deep)
      if (this.isMergeProp(value)) {
        if (isPartialReload && !this.isRequested(key, requestedProps)) {
          continue
        }

        switch (value.strategy) {
          case 'prepend':
            prependProps.push(key)
            break
          case 'deep':
            deepMergeProps.push(key)
            break
          default:
            mergeProps.push(key)
            break
        }

        if (value.matchOn) {
          matchPropsOn.push(`${key}:${value.matchOn}`)
        }

        resolvedProps[key] = await value.callback()
        continue
      }

      // Handle optional props
      if (this.isOptionalProp(value)) {
        if (isPartialReload && this.isRequested(key, requestedProps)) {
          resolvedProps[key] = await value.callback()
        }
        continue
      }

      // Regular props
      if (isPartialReload) {
        if (this.isRequested(key, requestedProps) && !this.isExcepted(key, exceptProps)) {
          resolvedProps[key] = value
        }
      } else {
        resolvedProps[key] = value
      }
    }

    return { resolvedProps, mergeProps, prependProps, deepMergeProps, matchPropsOn, deferredProps, onceProps }
  }

  /**
   * Check if a prop key is requested — supports dot-notation (e.g., `user.permissions`
   * matches the top-level `user` key).
   */
  private isRequested(key: string, requestedProps: string[]): boolean {
    return requestedProps.some((prop) => prop === key || prop.startsWith(`${key}.`))
  }

  private isExcepted(key: string, exceptProps: string[]): boolean {
    return exceptProps.some((prop) => prop === key || prop.startsWith(`${key}.`))
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

  private isOnceProp(value: unknown): value is InertiaOnceProp {
    return typeof value === 'object' && value !== null && INERTIA_PROP_ONCE in value
  }

  private isAlwaysProp(value: unknown): value is InertiaAlwaysProp {
    return typeof value === 'object' && value !== null && INERTIA_PROP_ALWAYS in value
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
