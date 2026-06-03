import type { Page } from '@inertiajs/core'
import { Singleton, inject } from 'stratal/di'
import { ApplicationError } from 'stratal/errors'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type { ManifestService } from './manifest.service'

const APP_ID = 'app'

@Singleton()
export class TemplateService {
  // The root template is split once around the @inertia placeholder so the
  // document shell can be flushed before the React stream and closed after it.
  private readonly pre: string
  private readonly post: string

  constructor(
    @inject(INERTIA_TOKENS.Options) options: InertiaModuleOptions,
    @inject(INERTIA_TOKENS.ManifestService) private readonly manifest: ManifestService,
  ) {
    // Match the standalone @inertia token, not the @inertiaHead placeholder it
    // is a prefix of (the word boundary fails between `a` and `H`).
    const match = /@inertia\b/.exec(options.rootView)
    if (!match) {
      throw new ApplicationError('[stratal:inertia] rootView template is missing the @inertia placeholder.')
    }
    this.pre = options.rootView.slice(0, match.index)
    this.post = options.rootView.slice(match.index + '@inertia'.length)
  }

  /**
   * Compose the streamed HTML response: the document shell (head + opening
   * `#app` wrapper) is flushed first, the React stream is piped verbatim, then
   * the wrapper is closed and the trailing scripts are appended.
   *
   * Reproduces Inertia's `buildSSRBody` markup: a `<script data-page>` JSON tag
   * (parsed before hydration) followed by `<div data-server-rendered id="app">`.
   */
  renderStream(page: Page, head: string[], reactStream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    const shellPre = this.buildShell(head)
      + `<script data-page="${APP_ID}" type="application/json">${this.serialize(page)}</script>`
      + `<div data-server-rendered="true" id="${APP_ID}">`
    const shellPost = `</div>${this.buildScripts()}`

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(shellPre))
        const reader = reactStream.getReader()
        try {
          for (; ;) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
        } catch (error) {
          controller.error(error)
          return
        } finally {
          reader.releaseLock()
        }
        controller.enqueue(encoder.encode(shellPost))
        controller.close()
      },
    })
  }

  /**
   * Buffered, client-only document used when SSR is disabled for the request.
   * Emits an empty `#app` div for the client bundle to hydrate.
   */
  renderClientOnly(page: Page, head: string[]): string {
    return this.buildShell(head)
      + `<script data-page="${APP_ID}" type="application/json">${this.serialize(page)}</script><div id="${APP_ID}"></div>`
      + this.buildScripts()
  }

  // Function replacements are required: a string replacement interprets `$$`,
  // `$&`, `` $` `` and `$'` patterns, which would corrupt head/script content
  // that legitimately contains a `$`.
  private buildShell(head: string[]): string {
    const headTags = head.join('\n')
    return this.pre
      .replace('@viteHead', () => this.manifest.getHeadTags())
      .replace('@inertiaHead', () => headTags)
  }

  private buildScripts(): string {
    return this.post.replace('@viteScripts', () => this.manifest.getScriptTags())
  }

  private serialize(page: Page): string {
    return JSON.stringify(page).replace(/\//g, '\\/')
  }
}
