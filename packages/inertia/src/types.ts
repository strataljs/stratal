import type { Page, ScrollProp, SharedPageProps } from '@inertiajs/core'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { MessageKeys } from 'stratal/i18n'
import type { RouterContext } from 'stratal/router'


export interface InertiaPageRegistry {}

export interface InertiaI18nConfig {}

export type InertiaTranslationKeys =
  InertiaI18nConfig extends { translationKeys: infer T extends string } ? T : MessageKeys

// Derive shared props from @inertiajs/core's InertiaConfig.sharedPageProps.
// Users augment InertiaConfig in their global.d.ts — this type stays in sync automatically.
export type InertiaSharedProps = SharedPageProps

export type InertiaPageComponent = keyof InertiaPageRegistry extends never
  ? string
  : Extract<keyof InertiaPageRegistry, string>

// Allows each prop value to be wrapped with defer/merge/scroll/optional/once/always
type AllowInertiaWrappers<T> = {
  [K in keyof T]: T[K] | InertiaDeferredProp | InertiaMergeProp | InertiaScrollProp | InertiaOptionalProp | InertiaOnceProp | InertiaAlwaysProp
}

// Props the controller passes to ctx.inertia() — page-specific only, shared props are auto-injected
// Each prop can be the raw value OR a deferred/merge/scroll/optional/once/always wrapper
export type ResolvedInertiaPageProps<C extends InertiaPageComponent> =
  C extends keyof InertiaPageRegistry ? AllowInertiaWrappers<InertiaPageRegistry[C]> : Record<string, unknown>

// Full props the React page component receives — page-specific + shared (auto-injected), no wrappers
export type InertiaFullPageProps<C extends InertiaPageComponent> =
  (C extends keyof InertiaPageRegistry ? InertiaPageRegistry[C] : Record<string, unknown>) & InertiaSharedProps

// Re-export Page from @inertiajs/core as InertiaPage for convenience
export type { Page as InertiaPage } from '@inertiajs/core'

/**
 * Everything about an incoming request that changes how props resolve, read
 * once and passed down. A caller assembling its own page supplies `requested`
 * and `reset` relative to its own prop record.
 */
export interface InertiaPartialRequest {
  /** Whether this request asked for a subset of props rather than the whole page. */
  isPartial: boolean
  /** Prop names asked for, when `isPartial`. */
  requested: string[]
  /** Prop names explicitly excluded. */
  except: string[]
  /** Prop names whose accumulated client state is being reset. */
  reset: string[]
  /** Whether an infinite-scroll fetch asked for its page to be prepended. */
  prependIntent: boolean
  /** Whether deferred props should resolve in this response rather than a follow-up. */
  resolveDeferred: boolean
}

/**
 * Resolved prop values plus the metadata that travels beside them on the page
 * object. Every string is a prop path, relative to the record resolved.
 */
export interface InertiaPropResolution {
  resolvedProps: Record<string, unknown>
  mergeProps: string[]
  prependProps: string[]
  deepMergeProps: string[]
  matchPropsOn: string[]
  scrollProps: Record<string, ScrollProp>
  deferredProps: Record<string, string[]>
  onceProps: Record<string, { prop: string; expiresAt?: number | null }>
}

export interface InertiaRenderOptions {
  encryptHistory?: boolean
  clearHistory?: boolean
  preserveFragment?: boolean
  /**
   * HTTP status code to use for the rendered response. Defaults to `200`.
   * Useful for rendering Inertia error pages (e.g. `Errors/404` with status 404).
   */
  status?: ContentfulStatusCode
}

/**
 * Streaming SSR render result. `head` carries the document `<head>` tags Inertia
 * collected during the synchronous shell render (known once the shell is ready);
 * `stream` is React's `renderToReadableStream` output, piped into the `#app` body.
 */
export interface InertiaSsrResult {
  head: string[]
  stream: ReadableStream<Uint8Array>
}

export interface InertiaSsrBundle {
  render(page: Page): Promise<InertiaSsrResult>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SharedDataResolver = (ctx: RouterContext) => any

export interface ViteManifestEntry {
  file: string
  css?: string[]
  isEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  src?: string
}

export type ViteManifest = Record<string, ViteManifestEntry>

export const INERTIA_PROP_OPTIONAL = Symbol.for('stratal:inertia:prop:optional')
export const INERTIA_PROP_DEFERRED = Symbol.for('stratal:inertia:prop:deferred')
export const INERTIA_PROP_MERGE = Symbol.for('stratal:inertia:prop:merge')
export const INERTIA_PROP_SCROLL = Symbol.for('stratal:inertia:prop:scroll')
export const INERTIA_PROP_ONCE = Symbol.for('stratal:inertia:prop:once')
export const INERTIA_PROP_ALWAYS = Symbol.for('stratal:inertia:prop:always')

/**
 * Header the client sends on every infinite-scroll fetch to say which end of the
 * accumulated list the response should be joined to. Absent on the first render,
 * which is not a scroll fetch.
 */
export const INERTIA_SCROLL_MERGE_INTENT_HEADER = 'x-inertia-infinite-scroll-merge-intent'

/**
 * Every request header an Inertia response body is a function of, beyond
 * `X-Inertia` itself. This is the set `partialRequestFor` reads to decide which
 * props to resolve, so two requests to one URL differing in any of them receive
 * different bodies.
 *
 * They are declared in `Vary` on EVERY Inertia response, not only on partial
 * reloads, and that is the load-bearing part: a cache matches a stored response
 * against the `Vary` IT was stored with. A full page response stored under
 * `Vary: X-Inertia` alone would be served to a partial reload, which sends the
 * same `X-Inertia: true` and would receive the whole page in place of the props
 * it asked for.
 *
 * `X-Inertia-Version` is deliberately absent. A mismatch answers 409, which is
 * never cached, and the asset version only moves with a deploy — which moves the
 * Worker version that Workers Caching already keys on, so a stale client cannot
 * reach an entry stored before it.
 */
export const INERTIA_VARY_HEADERS = [
  'X-Inertia',
  'X-Inertia-Partial-Component',
  'X-Inertia-Partial-Data',
  'X-Inertia-Partial-Except',
  'X-Inertia-Reset',
  'X-Inertia-Resolve-Deferred',
  INERTIA_SCROLL_MERGE_INTENT_HEADER,
] as const

export interface InertiaOptionalProp<T = unknown> {
  [INERTIA_PROP_OPTIONAL]: true
  callback: () => T
}

export interface InertiaDeferredProp<T = unknown> {
  [INERTIA_PROP_DEFERRED]: true
  callback: () => T
  group: string
}

export type InertiaMergeStrategy = 'append' | 'prepend' | 'deep'

export interface InertiaMergeProp<T = unknown> {
  [INERTIA_PROP_MERGE]: true
  callback: () => T
  strategy: InertiaMergeStrategy
  matchOn?: string
}

/**
 * Identifies one page of a scroll-paginated prop. The client sends the value
 * back verbatim as the pagination query parameter, so it is a page number or a
 * cursor — never a URL. `null` means there is no page on that side, which is
 * how the client's `hasNext()` / `hasPrevious()` read "no more".
 */
export type InertiaScrollPageIdentifier = string | number | null

/**
 * The pagination identifiers the client's infinite-scroll helper reads off the
 * page object. Derived from a paginated result by default; supply a resolver to
 * `ctx.scroll()` for a shape the framework does not recognise.
 */
export interface InertiaScrollMetadata {
  /** Query parameter the client sends the requested page under. */
  pageName: string
  /** Identifier of the page this response carries. */
  currentPage: InertiaScrollPageIdentifier
  /** Identifier to request for the previous page, or `null` when there is none. */
  previousPage: InertiaScrollPageIdentifier
  /** Identifier to request for the next page, or `null` when there is none. */
  nextPage: InertiaScrollPageIdentifier
}

export type InertiaScrollMetadataResolver<T> = (value: T) => InertiaScrollMetadata

export interface InertiaScrollOptions<T = unknown> {
  /**
   * Key inside the prop value holding the rows that accumulate. Defaults to
   * `data`, matching `paginatedResponseSchema`. The prop value itself stays
   * paginator-shaped — only this key is merged across pages.
   */
  wrapper?: string
  /** Field to deduplicate rows on while merging, e.g. `id`. */
  matchOn?: string
  /** Overrides the query parameter name derived from the paginated result. */
  pageName?: string
  /** Extracts the pagination identifiers from a result shape the framework cannot derive. */
  metadata?: InertiaScrollMetadataResolver<T>
}

/**
 * A merge prop that also publishes pagination metadata. The merge direction is
 * chosen by the request rather than the caller — the client says which end of
 * its accumulated list this page joins.
 */
export interface InertiaScrollProp<T = unknown> {
  [INERTIA_PROP_SCROLL]: true
  callback: () => T | Promise<T>
  wrapper: string
  matchOn?: string
  pageName?: string
  metadata?: InertiaScrollMetadataResolver<T>
}

export interface InertiaOnceProp<T = unknown> {
  [INERTIA_PROP_ONCE]: true
  callback: () => T
  expiresAt?: number | null
  key?: string
}

export interface InertiaAlwaysProp<T = unknown> {
  [INERTIA_PROP_ALWAYS]: true
  callback: () => T
}
