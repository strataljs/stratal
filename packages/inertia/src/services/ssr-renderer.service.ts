import type { Page } from '@inertiajs/core'
import { Singleton, inject } from 'stratal/di'
import { ApplicationError } from 'stratal/errors'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type { InertiaSsrBundle, InertiaSsrResult } from '../types'

@Singleton()
export class SsrRendererService {
  private bundle: InertiaSsrBundle | null = null
  private loadPromise: Promise<void> | null = null

  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
  ) { }

  /**
   * Render a page to a streaming SSR result.
   *
   * The SSR bundle is imported once per worker (memoized). Bundle-load and render
   * errors propagate — there is no silent client-side fallback. Callers must only
   * invoke this when `options.ssr` is configured.
   */
  async render(page: Page): Promise<InertiaSsrResult> {
    if (!this.options.ssr) {
      throw new ApplicationError('[stratal:inertia] SSR bundle is not configured.')
    }

    await this.ensureBundle()
    return this.bundle!.render(page)
  }

  private async ensureBundle(): Promise<void> {
    if (this.bundle) return
    this.loadPromise ??= this.loadBundle()
    try {
      await this.loadPromise
    } catch (error) {
      // Allow a later request to retry a transient import failure, but still
      // surface the error to this request (no silent client-side fallback).
      this.loadPromise = null
      throw error
    }
  }

  private async loadBundle(): Promise<void> {
    const mod = await this.options.ssr!.bundle()
    this.bundle = ('default' in mod ? mod.default : mod)
  }
}
