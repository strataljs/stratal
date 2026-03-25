import type { InertiaAppSSRResponse, Page } from '@inertiajs/core'
import { Transient, inject } from 'stratal/di'
import { LOGGER_TOKENS, LoggerService } from 'stratal/logger'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'

interface LoadedSsrBundle {
  render(page: Page): Promise<InertiaAppSSRResponse>
}

@Transient()
export class SsrRendererService {
  private bundle: LoadedSsrBundle | null = null
  private loadPromise: Promise<void> | null = null

  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService
  ) { }

  async render(page: Page): Promise<InertiaAppSSRResponse> {
    if (!this.options.ssr) {
      return { head: [], body: '' }
    }

    await this.ensureBundle()

    if (!this.bundle) {
      return { head: [], body: '' }
    }

    return this.bundle.render(page)
  }

  private async ensureBundle(): Promise<void> {
    if (this.bundle) return

    this.loadPromise ??= this.loadBundle()

    try {
      await this.loadPromise
    } catch {
      // loadBundle already clears loadPromise on failure
    }
  }

  private async loadBundle(): Promise<void> {
    if (!this.options.ssr) return

    try {
      const mod = await this.options.ssr.bundle()
      const resolved = ('default' in mod ? mod.default : mod) as LoadedSsrBundle
      this.bundle = resolved
    } catch (error: unknown) {
      this.logger.warn('[stratal:inertia] Failed to load SSR bundle. Falling back to client-side rendering.', { error })
      this.loadPromise = null
    }
  }
}
