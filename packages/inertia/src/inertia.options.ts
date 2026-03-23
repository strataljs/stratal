import type { InertiaSsrResult } from './types'

interface SsrBundleModule {
  render(...args: never[]): Promise<InertiaSsrResult>
}

export interface InertiaSsrOptions {
  bundle: () => Promise<SsrBundleModule | { default: SsrBundleModule }>
}

export interface InertiaModuleOptions {
  rootView: string
  version?: string
  ssr?: InertiaSsrOptions
  sharedData?: Record<string, unknown>
}
