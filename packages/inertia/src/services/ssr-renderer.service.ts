import { Transient, inject } from 'stratal/di'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type { InertiaPage, InertiaSsrResult } from '../types'

interface LoadedSsrBundle {
  render(page: InertiaPage): Promise<InertiaSsrResult>
}

@Transient()
export class SsrRendererService {
  private bundle: LoadedSsrBundle | null = null
  private loadPromise: Promise<void> | null = null

  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
  ) { }

  async render(page: InertiaPage): Promise<InertiaSsrResult> {
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

    this.loadPromise ??= this.loadBundle();

    await this.loadPromise
  }

  private async loadBundle(): Promise<void> {
    if (!this.options.ssr) return

    try {
      const mod = await this.options.ssr.bundle()
      const resolved = ('default' in mod ? mod.default : mod) as LoadedSsrBundle
      this.bundle = resolved
    } catch {
      this.loadPromise = null
    }
  }
}
