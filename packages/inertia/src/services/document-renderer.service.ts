import type { Page } from '@inertiajs/core'
import { Singleton, inject } from 'stratal/di'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import { getSsrExcludeMatchers, isSsrExcluded } from './ssr-exclusion'
import type { SsrRendererService } from './ssr-renderer.service'
import type { TemplateService } from './template.service'

/**
 * Renders a fully-built {@link Page} into an HTML document Response, choosing
 * streaming SSR or a client-only shell.
 *
 * SSR is skipped — and the page rendered client-only for the client bundle to
 * hydrate — when SSR is unconfigured, or when the page component was build-time
 * excluded from the worker bundle via `stratalInertia({ ssrExclude })` (there is
 * no SSR entry left to render it from). Centralising the decision keeps the
 * exclusion rule in one place; both {@link InertiaService} and the modal renderer
 * delegate here rather than duplicating the branch.
 */
@Singleton()
export class DocumentRendererService {
  // Component-name matchers for pages excluded from SSR at build time. The Vite
  // plugin drops these from the worker bundle, so they must render client-only.
  // Compiled once per isolate — the pattern list is static.
  private readonly ssrExcludeMatchers: RegExp[] = getSsrExcludeMatchers()

  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
    @inject(INERTIA_TOKENS.SsrRenderer) private readonly ssr: SsrRendererService,
    @inject(INERTIA_TOKENS.TemplateService) private readonly template: TemplateService,
  ) { }

  /**
   * Render `page` to an HTML document Response. `extraHead` tags are appended to
   * `<head>` — after the SSR-rendered Inertia `<Head>` when streaming, or as the
   * only head tags in the client-only shell.
   */
  async render(page: Page, status = 200, extraHead: string[] = []): Promise<Response> {
    const ssrDisabled = !this.options.ssr || isSsrExcluded(page.component, this.ssrExcludeMatchers)

    if (ssrDisabled) {
      const html = this.template.renderClientOnly(page, extraHead)
      return new Response(html, {
        status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const { head, stream } = await this.ssr.render(page)
    const body = this.template.renderStream(page, [...head, ...extraHead], stream)
    return new Response(body, {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
