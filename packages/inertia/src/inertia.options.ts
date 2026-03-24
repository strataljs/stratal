import type { InertiaSsrResult, ViteManifest } from './types'

interface SsrBundleModule {
  render(...args: never[]): Promise<InertiaSsrResult>
}

export interface InertiaSsrOptions {
  bundle: () => Promise<SsrBundleModule | { default: SsrBundleModule }>
  /**
   * Route patterns where SSR is disabled (e.g., `"admin/*"`).
   * Uses simple glob matching against the request pathname.
   */
  disabled?: string[]
}

export interface InertiaModuleOptions {
  rootView: string
  version?: string
  ssr?: InertiaSsrOptions
  sharedData?: Record<string, unknown>
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
