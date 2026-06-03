import type { InertiaAppSSRResponse, Page } from '@inertiajs/core'
import type { MessageKeyPrefix } from 'stratal/i18n'
import type { RouterContext } from 'stratal/router'
import type { FlashStore } from './flash/flash-store'
import type { SeoData } from './seo/types'

interface SsrBundleModule {
  render(page: Page): Promise<InertiaAppSSRResponse>
}

export interface InertiaSsrOptions {
  bundle: () => Promise<SsrBundleModule | { default: SsrBundleModule }>
  /**
   * Route patterns where SSR is disabled (e.g., `"admin/*"`).
   * Uses simple glob matching against the request pathname.
   */
  disabled?: string[]
}

/**
 * Configuration for sharing i18n messages with the frontend.
 *
 * When provided to {@link InertiaModuleOptions.i18n}, the module auto-injects
 * `locale` (string) and `translations` (flattened messages) into every Inertia
 * page response as shared props. Use `only` to restrict which message namespaces
 * are sent to the frontend.
 *
 * @example
 * ```typescript
 * InertiaModule.forRoot({
 *   rootView,
 *   i18n: { only: ['common', 'nav'] },
 * })
 * ```
 */
export interface InertiaI18nOptions {
  /**
   * Dot-notation message key prefixes to include in frontend translations.
   *
   * Only messages whose keys match or start with the given prefixes are shared.
   * When omitted, all messages are sent to the frontend.
   *
   * @example
   * ```typescript
   * // Only share 'common' and 'nav' namespaces
   * { only: ['common', 'nav'] }
   *
   * // Share a deeply nested namespace
   * { only: ['common.actions'] }
   * ```
   */
  only?: MessageKeyPrefix[]
}

export interface InertiaFlashOptions {
  store: FlashStore
}

/**
 * Configuration for backend-driven SEO metadata.
 *
 * Set on {@link InertiaModuleOptions.seo}. Controllers contribute per-page
 * metadata via `ctx.seo()`; the module merges it over these defaults, applies
 * the title template, injects the resulting tags into `<head>`, and shares the
 * resolved data as the `seo` prop. The client head stays in sync automatically
 * via the runtime the `stratalInertia()` Vite plugin injects; read the data in a
 * component with `useSeo()` from `@stratal/inertia/react`.
 *
 * Both `defaults` and `titleTemplate` accept a static value or a `ctx`-aware
 * resolver function (optionally async), so they can pull from the database or
 * elsewhere for personalization — mirroring {@link InertiaModuleOptions.sharedData}.
 *
 * @example
 * ```typescript
 * InertiaModule.forRoot({
 *   rootView,
 *   seo: {
 *     defaults: { openGraph: { siteName: 'Acme' }, twitter: { card: 'summary_large_image' } },
 *     titleTemplate: '%s — Acme',
 *   },
 * })
 *
 * // Dynamic / personalized:
 * InertiaModule.forRoot({
 *   rootView,
 *   seo: {
 *     titleTemplate: async (title, ctx) => `${title} — ${(await ctx.user()).name}'s Workspace`,
 *   },
 * })
 * ```
 */
export interface InertiaSeoOptions {
  /**
   * App-wide default SEO metadata, merged under each page's `ctx.seo()` values.
   * Provide a static object or a (possibly async) resolver receiving the request `ctx`.
   */
  defaults?: SeoData | ((ctx: RouterContext) => SeoData | Promise<SeoData>)
  /**
   * Template applied to a page-provided title. The string form replaces `%s`
   * with the page title (e.g. `'%s — Acme'`); a bare default title is used as-is.
   * The function form receives the resolved title (possibly `undefined` when no
   * page or default title is set) and the request `ctx`, and returns the final
   * title (full control, may be async). Return `undefined` to leave the title
   * unset — useful for conditionally skipping the template (e.g. for a subset of
   * routes that build their own title).
   */
  titleTemplate?:
    | string
    | ((title: string | undefined, ctx: RouterContext) => string | undefined | Promise<string | undefined>)
}

export interface InertiaModuleOptions {
  rootView: string
  version?: string
  ssr?: InertiaSsrOptions
  flash?: InertiaFlashOptions
  sharedData?: Record<string, unknown>
  /**
   * I18n configuration for sharing backend translation messages with the frontend.
   *
   * When set, the module auto-injects `locale` and `translations` as shared props
   * on every page response. Use with `useI18n()` from `@stratal/inertia/react` on the frontend.
   *
   * @example
   * ```typescript
   * InertiaModule.forRoot({
   *   rootView,
   *   i18n: { only: ['common', 'nav'] },
   * })
   * ```
   */
  i18n?: InertiaI18nOptions
  /**
   * When `true`, serializes all named routes and injects them as a `routes`
   * shared prop on every Inertia page response.
   *
   * Use with `useRoute()` from `@stratal/inertia/react` on the frontend for
   * Ziggy-like client-side URL generation.
   *
   * @example
   * ```typescript
   * InertiaModule.forRoot({
   *   rootView,
   *   routes: true,
   * })
   * ```
   */
  routes?: boolean
  /**
   * SEO configuration: app-wide defaults and a title template for backend-driven
   * page metadata. Pages set their metadata via `ctx.seo()`; the frontend reads
   * it with `<Seo/>` / `useSeo()` from `@stratal/inertia/react`.
   */
  seo?: InertiaSeoOptions
  /**
   * Client entry path relative to project root (default: `src/inertia/app.tsx`).
   * Used in dev mode to inject the entry script tag.
   */
  entryClientPath?: string
}
