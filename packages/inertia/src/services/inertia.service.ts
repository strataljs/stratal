import type { Page } from '@inertiajs/core'
import type { Application } from 'stratal'
import { DI_TOKENS, Request, inject } from 'stratal/di'
import { I18N_TOKENS, type MessageLoaderService } from 'stratal/i18n'
import { ROUTER_CONTEXT_KEYS, ROUTER_TOKENS, resolveTrailingSlash, type CurrentRoute, type LocalePathService, type LocaleUrlConfig, type RegisteredRoute, type RouteRegistry, type RouterContext, type SerializedRoutes, type Uri } from 'stratal/router'
import type { InertiaMergeOptions, InertiaOnceOptions } from '../augment/router-context'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type { SeoData } from '../seo/types'
import type {
  InertiaAlwaysProp,
  InertiaDeferredProp,
  InertiaMergeProp,
  InertiaOnceProp,
  InertiaOptionalProp,
  InertiaPartialRequest,
  InertiaPropResolution,
  InertiaRenderOptions,
  InertiaScrollOptions,
  InertiaScrollProp,
  SharedDataResolver,
} from '../types'
import {
  INERTIA_PROP_ALWAYS,
  INERTIA_PROP_DEFERRED,
  INERTIA_PROP_MERGE,
  INERTIA_PROP_ONCE,
  INERTIA_PROP_OPTIONAL,
  INERTIA_PROP_SCROLL,
  INERTIA_SCROLL_MERGE_INTENT_HEADER,
} from '../types'
import type { DocumentRendererService } from './document-renderer.service'
import { buildInertiaCacheSignals } from './inertia-cache-signals'
import { deriveScrollMetadata } from './scroll-metadata'
import type { SeoService } from './seo.service'

@Request(INERTIA_TOKENS.InertiaService)
export class InertiaService {
  private sharedData: Record<string, unknown> = {}

  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
    @inject(INERTIA_TOKENS.DocumentRenderer) private readonly documentRenderer: DocumentRendererService,
    @inject(INERTIA_TOKENS.SeoService) private readonly seoService: SeoService,
  ) { }

  share(key: string, value: unknown): void {
    this.sharedData[key] = value
  }

  seo(data: SeoData): void {
    this.seoService.set(data)
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

  scroll<T>(callback: () => T | Promise<T>, options?: InertiaScrollOptions<T>): InertiaScrollProp<T> {
    return {
      [INERTIA_PROP_SCROLL]: true,
      callback,
      wrapper: options?.wrapper ?? 'data',
      matchOn: options?.matchOn,
      pageName: options?.pageName,
      metadata: options?.metadata,
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
    const reqUrl = new URL(ctx.c.req.url)
    const url = reqUrl.search ? `${reqUrl.pathname}${reqUrl.search}` : reqUrl.pathname
    const isInertia = ctx.c.get('inertia')

    // Resolve shared data from module options
    const { shared: resolvedShared, sharedKeys } = await this.resolveSharedData(ctx)

    // Resolve SEO once: shared as the `seo` prop (drives the client head-sync runtime)
    // and rendered into <head> below for the initial paint. Wrapped as an ALWAYS
    // prop so it is present on every response — including partial reloads that
    // don't request it — otherwise the client runtime would see a missing `seo`
    // key and wipe the managed head tags even though nothing changed.
    const resolvedSeo = await this.seoService.resolve(ctx)

    // Merge shared data with route props. `seo` is always-evaluated so it can
    // never be filtered out by partial-reload prop selection.
    const allProps = { ...resolvedShared, ...this.sharedData, seo: this.always(() => resolvedSeo), ...props }

    // Track all shared prop keys (module config + per-request .share() + seo)
    const allSharedKeys = [...sharedKeys, ...Object.keys(this.sharedData), 'seo']

    // Process props: handle optional, deferred, merge, once, always
    const result = await this.processProps(allProps, this.partialRequestFor(ctx, component, isInertia))

    // Read flash data from context (set by middleware)
    const rawFlash = (ctx.c.get('inertiaFlash') as Record<string, unknown> | undefined) ?? {}
    const { errors: flashErrors, ...flash } = rawFlash
    const errors = (flashErrors && typeof flashErrors === 'object' && !Array.isArray(flashErrors))
      ? flashErrors as Page['props']['errors']
      : {} as Page['props']['errors']

    // Publish for `{data.*}` cache tags and the response-cache fail-closed
    // checks. Core's `capturePayload` only parses JSON-family response
    // bodies — an Inertia document response is HTML — so without this,
    // `{data.*}` would never resolve on Inertia routes. Merges `errors` in
    // the same way `page.props` below does, so a `{data.errors.*}` tag
    // template sees exactly what the client receives.
    ctx.c.set(ROUTER_CONTEXT_KEYS.RESPONSE_PAYLOAD, { ...result.resolvedProps, errors })
    ctx.c.set('inertiaCacheSignals', buildInertiaCacheSignals({
      flash: rawFlash,
      isPartial: this.isPartialReload(ctx, component),
      onceProps: result.onceProps,
    }))

    const page: Page = {
      component,
      props: { ...result.resolvedProps, errors },
      url,
      version: this.options.version ?? null,
      flash,
      rememberedState: {},
      rescuedProps: [],
      ...(result.mergeProps.length > 0 ? { mergeProps: result.mergeProps } : {}),
      ...(result.prependProps.length > 0 ? { prependProps: result.prependProps } : {}),
      ...(result.deepMergeProps.length > 0 ? { deepMergeProps: result.deepMergeProps } : {}),
      ...(result.matchPropsOn.length > 0 ? { matchPropsOn: result.matchPropsOn } : {}),
      ...(Object.keys(result.scrollProps).length > 0 ? { scrollProps: result.scrollProps } : {}),
      ...(Object.keys(result.deferredProps).length > 0 ? { deferredProps: result.deferredProps } : {}),
      ...(Object.keys(result.deferredProps).length > 0 && !this.isPartialReload(ctx, component) ? { initialDeferredProps: result.deferredProps } : {}),
      ...(Object.keys(result.onceProps).length > 0 ? { onceProps: result.onceProps } : {}),
      ...(allSharedKeys.length > 0 ? { sharedProps: allSharedKeys } : {}),
      ...(renderOptions.encryptHistory ? { encryptHistory: true } : {}),
      ...(renderOptions.clearHistory ? { clearHistory: true } : {}),
      ...(renderOptions.preserveFragment ? { preserveFragment: true } : {}),
    }

    const status = renderOptions.status ?? 200

    if (isInertia) {
      return new Response(JSON.stringify(page), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Inertia': 'true',
          'Vary': 'X-Inertia',
        },
      })
    }

    // Full page render — delegate to the document renderer, which streams SSR or
    // emits a client-only shell for SSR-unconfigured or build-time excluded
    // components. SEO tags are appended to the head.
    const seoTags = this.seoService.tagsFor(resolvedSeo)
    return this.documentRenderer.render(page, status, seoTags)
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

    if (this.options.routes) {
      const container = ctx.getContainer()
      const registry = container.resolve<RouteRegistry>(ROUTER_TOKENS.RouteRegistry)
      const application = container.resolve<Application>(DI_TOKENS.Application)
      const uri = container.resolve<Uri>(ROUTER_TOKENS.Uri)

      const name = registry.findNameByRoute(ctx.c.req.method, ctx.c.req.routePath) ?? null
      const params = { ...ctx.param() }

      const localePathService = container.resolve<LocalePathService>(ROUTER_TOKENS.LocalePathService)

      shared.routes = this.serializeRoutes(registry.named())
      // Share the resolved mode only — exclusions are server-side (RegExp
      // patterns don't survive JSON). Excluded paths are served in both slash
      // forms by the server, so a client-canonicalised URL never redirects.
      shared.trailingSlash = resolveTrailingSlash(application.config.trailingSlash).mode
      shared.route = { name, params, defaults: uri.getDefaults() } satisfies CurrentRoute
      shared.localeConfig = {
        defaultLocale: localePathService.localePathConfig?.defaultLocale ?? null,
        prefixDefaultLocale: localePathService.prefixDefaultLocale,
      } satisfies LocaleUrlConfig
    }

    return { shared, sharedKeys: Object.keys(shared) }
  }

  private isPartialReload(ctx: RouterContext, component: string): boolean {
    const isInertia = ctx.c.get('inertia')
    const partialComponent = ctx.header('x-inertia-partial-component')
    const partialDataHeader = ctx.header('x-inertia-partial-data')
    return !!(isInertia && partialComponent === component && partialDataHeader)
  }

  /**
   * Reads everything about the incoming request that changes how props resolve.
   *
   * Split out so a caller assembling its own page — a modal level, whose props
   * sit under a path rather than at the page root — can resolve props with the
   * same semantics while supplying its own notion of which ones were asked for.
   */
  partialRequestFor(ctx: RouterContext, component: string, isInertia: boolean): InertiaPartialRequest {
    const partialComponent = ctx.header('x-inertia-partial-component')
    const partialDataHeader = ctx.header('x-inertia-partial-data')
    const partialExceptHeader = ctx.header('x-inertia-partial-except')
    const resetHeader = ctx.header('x-inertia-reset')

    return {
      isPartial: !!(isInertia && partialComponent === component && partialDataHeader),
      requested: partialDataHeader?.split(',').map((s) => s.trim()) ?? [],
      except: partialExceptHeader?.split(',').map((s) => s.trim()) ?? [],
      reset: resetHeader?.split(',').map((s) => s.trim()) ?? [],
      // Only the literal `prepend` prepends — this mirrors the client, which
      // sends exactly `append` or `prepend` and nothing else. Anything
      // unrecognised is a request that did not come from the infinite-scroll
      // helper, so it renders like a first paint.
      prependIntent: ctx.header(INERTIA_SCROLL_MERGE_INTENT_HEADER) === 'prepend',
      resolveDeferred: ctx.header('x-inertia-resolve-deferred') === 'true',
    }
  }

  /**
   * Resolves a prop record with the helper semantics `render()` applies, for a
   * caller that owns its own page assembly.
   *
   * The returned paths are relative to the record passed in; a caller whose
   * props live under a page path re-anchors them before they reach the page
   * object.
   */
  async resolveProps(props: Record<string, unknown>, request: InertiaPartialRequest): Promise<InertiaPropResolution> {
    return this.processProps(props, request)
  }

  private async processProps(
    allProps: Record<string, unknown>,
    request: InertiaPartialRequest,
  ): Promise<InertiaPropResolution> {
    const resolution: InertiaPropResolution = {
      resolvedProps: {},
      mergeProps: [],
      prependProps: [],
      deepMergeProps: [],
      matchPropsOn: [],
      scrollProps: {},
      deferredProps: {},
      onceProps: {},
    }

    await this.collectProps(allProps, request, resolution, resolution.resolvedProps, '', false)

    return resolution
  }

  /**
   * Resolve one record of props into `into`, naming each by its full path.
   *
   * Recursive because the protocol addresses a nested prop by its dot path: `only: ['auth.user']`
   * asks for one field of `auth`, not for the whole of it. Answering with all of `auth` is the
   * payload the partial reload was sent to avoid.
   *
   * Three things make a prop survive a partial reload, mirroring Laravel's resolver: the request
   * is not partial, its own path was asked for, or an ancestor of it resolved. The last is why a
   * `defer()`/`optional()` prop comes back whole when a path inside it is asked for — nothing
   * inside a callback's result can be narrowed without running the callback, so once it runs, all
   * of it is included.
   *
   * Only plain objects are descended into. An array is a value: the client reads `items.0.name`
   * as a path, but a partial reload asking for one element of a list it does not hold yet has
   * nothing to merge that element into.
   */
  private async collectProps(
    props: Record<string, unknown>,
    request: InertiaPartialRequest,
    resolution: InertiaPropResolution,
    into: Record<string, unknown>,
    parentPath: string,
    parentWasResolved: boolean,
  ): Promise<void> {
    const {
      isPartial: isPartialReload,
      requested: requestedProps,
      except: exceptProps,
      reset: resetProps,
      prependIntent,
      resolveDeferred: shouldResolveDeferred,
    } = request

    for (const [key, value] of Object.entries(props)) {
      const path = parentPath === '' ? key : `${parentPath}.${key}`

      // This path was named, or sits inside one that was.
      const named = !isPartialReload || parentWasResolved || this.isNamed(path, requestedProps)
      // Something inside this path was named, so it is on the way to what was asked for.
      const encloses = isPartialReload && this.enclosesNamed(path, requestedProps)

      // Handle always props — always resolve regardless of partial reload
      if (this.isAlwaysProp(value)) {
        into[key] = await value.callback()
        continue
      }

      // Handle once props
      if (this.isOnceProp(value)) {
        if (isPartialReload && (named || encloses)) {
          into[key] = await value.callback()
        } else if (!isPartialReload) {
          into[key] = await value.callback()
          resolution.onceProps[path] = {
            prop: value.key ?? path,
            ...(value.expiresAt != null ? { expiresAt: value.expiresAt } : {}),
          }
        }
        continue
      }

      // Handle deferred props
      if (this.isDeferredProp(value)) {
        if (isPartialReload && (named || encloses)) {
          into[key] = await value.callback()
        } else if (!isPartialReload) {
          if (shouldResolveDeferred) {
            into[key] = await value.callback()
          } else {
            resolution.deferredProps[value.group] ??= []
            resolution.deferredProps[value.group].push(path)
          }
        }
        continue
      }

      // Handle merge props (append/prepend/deep)
      if (this.isMergeProp(value)) {
        if (isPartialReload && !named && !encloses) {
          continue
        }

        // A prop the client asked to reset replaces its accumulated state
        // instead of joining it, so it registers no merge strategy at all.
        if (!resetProps.includes(path)) {
          switch (value.strategy) {
            case 'prepend':
              resolution.prependProps.push(path)
              break
            case 'deep':
              resolution.deepMergeProps.push(path)
              break
            default:
              resolution.mergeProps.push(path)
              break
          }

          // Dot-separated: the client finds an entry by dropping its last
          // segment and comparing the rest to the merged prop's path, so the
          // key it matches on is the final segment of a full path.
          if (value.matchOn) {
            resolution.matchPropsOn.push(`${path}.${value.matchOn}`)
          }
        }

        into[key] = await value.callback()
        continue
      }

      // Handle scroll props — a merge prop whose direction the request picks,
      // plus the pagination metadata the client's infinite-scroll helper reads
      // off the page object. The merge targets the wrapper key inside the prop,
      // so the value stays paginator-shaped and only its rows accumulate.
      if (this.isScrollProp(value)) {
        if (isPartialReload && !named && !encloses) {
          continue
        }

        const resolved = await value.callback()
        const isReset = resetProps.includes(path)

        if (!isReset) {
          const mergePath = `${path}.${value.wrapper}`

          if (prependIntent) {
            resolution.prependProps.push(mergePath)
          } else {
            resolution.mergeProps.push(mergePath)
          }

          if (value.matchOn) {
            resolution.matchPropsOn.push(`${mergePath}.${value.matchOn}`)
          }
        }

        const metadata = value.metadata ? value.metadata(resolved) : deriveScrollMetadata(resolved)

        resolution.scrollProps[path] = {
          pageName: value.pageName ?? metadata.pageName,
          currentPage: metadata.currentPage,
          previousPage: metadata.previousPage,
          nextPage: metadata.nextPage,
          reset: isReset,
        }

        into[key] = resolved
        continue
      }

      // Handle optional props
      if (this.isOptionalProp(value)) {
        if (isPartialReload && (named || encloses)) {
          into[key] = await value.callback()
        }
        continue
      }

      // A plain object on the way to a named path: descend, so the answer carries the field that
      // was asked for rather than everything beside it.
      if (!named && encloses && this.isPlainRecord(value)) {
        const child: Record<string, unknown> = {}
        await this.collectProps(value, request, resolution, child, path, false)
        if (Object.keys(child).length > 0) into[key] = child
        continue
      }

      if (!named || this.isExcepted(path, exceptProps)) continue

      // Named, and holding props of its own: walk it so a `defer()` or `merge()` nested inside is
      // resolved and reported at its full path, rather than travelling as an unresolved marker.
      if (this.isPlainRecord(value)) {
        const child: Record<string, unknown> = {}
        await this.collectProps(value, request, resolution, child, path, true)
        into[key] = child
        continue
      }

      into[key] = value
    }
  }

  /** Whether a plain `{}` record, as opposed to an array, a class instance or a prop marker. */
  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

    const prototype = Object.getPrototypeOf(value) as unknown
    return prototype === Object.prototype || prototype === null
  }

  /** Whether this path was asked for, or sits inside a path that was. */
  private isNamed(path: string, requestedProps: string[]): boolean {
    return requestedProps.some((prop) => prop === path || path.startsWith(`${prop}.`))
  }

  /** Whether something asked for sits inside this path. */
  private enclosesNamed(path: string, requestedProps: string[]): boolean {
    return requestedProps.some((prop) => prop.startsWith(`${path}.`))
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

  private isScrollProp(value: unknown): value is InertiaScrollProp {
    return typeof value === 'object' && value !== null && INERTIA_PROP_SCROLL in value
  }

  private isOnceProp(value: unknown): value is InertiaOnceProp {
    return typeof value === 'object' && value !== null && INERTIA_PROP_ONCE in value
  }

  private isAlwaysProp(value: unknown): value is InertiaAlwaysProp {
    return typeof value === 'object' && value !== null && INERTIA_PROP_ALWAYS in value
  }

  private serializeRoutes(routes: RegisteredRoute[]): SerializedRoutes {
    const serialized: SerializedRoutes = {}
    for (const route of routes) {
      if (route.name) {
        serialized[route.name] = {
          path: route.path,
          paramNames: route.paramNames,
          domainParamNames: route.domainParamNames,
          ...(route.domain ? { domain: route.domain } : {}),
          ...(route.localePaths?.length ? { localePaths: route.localePaths } : {}),
        }
      }
    }
    return serialized
  }
}
