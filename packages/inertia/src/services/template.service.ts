import { Transient, inject } from 'stratal/di'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type { InertiaPage } from '../types'
import type { ManifestService } from './manifest.service'

@Transient()
export class TemplateService {
  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
    @inject(INERTIA_TOKENS.ManifestService) private readonly manifest: ManifestService,
  ) { }

  render(page: InertiaPage, ssrHead: string[], ssrBody: string): string {
    const pageJson = this.escapePageJson(JSON.stringify(page))
    const appHtml = ssrBody
      ? `<div id="app" data-page="${pageJson}">${ssrBody}</div>`
      : `<div id="app" data-page="${pageJson}"></div>`

    const headTags = ssrHead.length > 0 ? ssrHead.join('\n') : ''
    const viteHead = this.manifest.getHeadTags()
    const viteScripts = this.manifest.getScriptTags()

    let html = this.options.rootView
    html = html.replace('@inertiaHead', headTags)
    html = html.replace('@inertia', appHtml)
    html = html.replace('@viteHead', viteHead)
    html = html.replace('@viteScripts', viteScripts)

    return html
  }

  private escapePageJson(json: string): string {
    return json
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&#039;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}
