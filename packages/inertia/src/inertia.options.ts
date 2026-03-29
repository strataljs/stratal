import type { InertiaAppSSRResponse, Page } from '@inertiajs/core'
import type { MessageKeyPrefix } from 'stratal/i18n'
import type { FlashStore } from './flash/flash-store'
import type { ViteManifest } from './types'

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
   * Vite manifest for production builds. When omitted, dev mode is assumed
   * and Vite client + entry scripts are injected with same-origin paths.
   */
  manifest?: ViteManifest
  /**
   * Client entry path relative to project root (default: `src/inertia/app.tsx`).
   * Used in dev mode to inject the entry script tag.
   */
  entryClientPath?: string
}
