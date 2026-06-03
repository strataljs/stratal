import type { Page } from '@inertiajs/core'
import { Transient, inject } from 'stratal/di'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type { ManifestService } from './manifest.service'

@Transient()
export class TemplateService {
  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
    @inject(INERTIA_TOKENS.ManifestService) private readonly manifest: ManifestService,
  ) { }

  render(page: Page, ssrHead: string[], ssrBody: string): string {
    // When SSR body is present, Inertia's buildSSRBody already returns the
    // <script data-page="app"> tag + <div id="app" data-server-rendered="true">.
    // Without SSR, we generate both elements ourselves for client-side hydration.
    const appHtml = ssrBody || this.buildClientOnlyBody(page)

    const headTags = ssrHead.length > 0 ? ssrHead.join('\n') : ''
    const viteHead = this.manifest.getHeadTags()
    const viteScripts = this.manifest.getScriptTags()

    // Use function replacements: a string replacement interprets `$$`, `$&`,
    // `` $` `` and `$'` patterns, which would corrupt SEO/page content that
    // legitimately contains a `$` (and could splice a placeholder token back in).
    let html = this.options.rootView
    html = html.replace('@inertiaHead', () => headTags)
    html = html.replace('@inertia', () => appHtml)
    html = html.replace('@viteHead', () => viteHead)
    html = html.replace('@viteScripts', () => viteScripts)

    return html
  }

  private buildClientOnlyBody(page: Page): string {
    const json = JSON.stringify(page).replace(/\//g, '\\/')
    return `<script data-page="app" type="application/json">${json}</script><div id="app"></div>`
  }
}
