import type { RouterContext } from 'stratal/router'

 
export interface InertiaPageRegistry {}

 
export interface InertiaSharedProps {}

export type InertiaPageComponent = keyof InertiaPageRegistry extends never
  ? string
  : Extract<keyof InertiaPageRegistry, string>

export type ResolvedInertiaPageProps<C extends InertiaPageComponent> =
  (C extends keyof InertiaPageRegistry ? InertiaPageRegistry[C] : Record<string, unknown>)
  & (keyof InertiaSharedProps extends never ? {} : InertiaSharedProps)

export interface InertiaPage {
  component: string
  props: Record<string, unknown>
  url: string
  version: string
  mergeProps: string[]
  deferredProps: Record<string, string[]>
  encryptHistory: boolean
  clearHistory: boolean
}

export interface InertiaRenderOptions {
  encryptHistory?: boolean
  clearHistory?: boolean
}

export interface InertiaSsrResult {
  head: string[]
  body: string
}

export interface InertiaSsrBundle {
  render(page: InertiaPage): Promise<InertiaSsrResult>
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

export interface InertiaOptionalProp {
  [INERTIA_PROP_OPTIONAL]: true
  callback: () => unknown
}

export interface InertiaDeferredProp {
  [INERTIA_PROP_DEFERRED]: true
  callback: () => unknown
  group: string
}

export interface InertiaMergeProp {
  [INERTIA_PROP_MERGE]: true
  callback: () => unknown
}
