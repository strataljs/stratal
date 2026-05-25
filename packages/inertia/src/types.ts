import type { InertiaAppSSRResponse, Page, SharedPageProps } from '@inertiajs/core'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { RouterContext } from 'stratal/router'


export interface InertiaPageRegistry {}

// Derive shared props from @inertiajs/core's InertiaConfig.sharedPageProps.
// Users augment InertiaConfig in their global.d.ts — this type stays in sync automatically.
export type InertiaSharedProps = SharedPageProps

export type InertiaPageComponent = keyof InertiaPageRegistry extends never
  ? string
  : Extract<keyof InertiaPageRegistry, string>

// Allows each prop value to be wrapped with defer/merge/optional/once/always
type AllowInertiaWrappers<T> = {
  [K in keyof T]: T[K] | InertiaDeferredProp | InertiaMergeProp | InertiaOptionalProp | InertiaOnceProp | InertiaAlwaysProp
}

// Props the controller passes to ctx.inertia() — page-specific only, shared props are auto-injected
// Each prop can be the raw value OR a deferred/merge/optional/once/always wrapper
export type ResolvedInertiaPageProps<C extends InertiaPageComponent> =
  C extends keyof InertiaPageRegistry ? AllowInertiaWrappers<InertiaPageRegistry[C]> : Record<string, unknown>

// Full props the React page component receives — page-specific + shared (auto-injected), no wrappers
export type InertiaFullPageProps<C extends InertiaPageComponent> =
  (C extends keyof InertiaPageRegistry ? InertiaPageRegistry[C] : Record<string, unknown>) & InertiaSharedProps

// Re-export Page from @inertiajs/core as InertiaPage for convenience
export type { Page as InertiaPage } from '@inertiajs/core'

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

// Use InertiaAppSSRResponse from @inertiajs/core — { head: string[]; body: string }
export type InertiaSsrResult = InertiaAppSSRResponse

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
export const INERTIA_PROP_ONCE = Symbol.for('stratal:inertia:prop:once')
export const INERTIA_PROP_ALWAYS = Symbol.for('stratal:inertia:prop:always')

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
