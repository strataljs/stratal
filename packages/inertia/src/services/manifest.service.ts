/// <reference types="vite/client" />

import { Singleton, inject } from 'stratal/di'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import type { ViteManifest } from '../types'

const DEFAULT_ENTRY_CLIENT_PATH = 'src/inertia/app.tsx'

interface ManifestGlobal {
  __STRATAL_INERTIA_MANIFEST__?: ViteManifest
}

@Singleton()
export class ManifestService {
  private readonly manifest: ViteManifest | null
  private readonly entryClientPath: string
  private readonly isDev: boolean = Boolean(import.meta.env.DEV)
  // The manifest is static for the lifetime of the worker, so the derived
  // head/script tag strings are computed once and cached.
  private headTags: string | null = null
  private scriptTags: string | null = null

  constructor(
    @inject(INERTIA_TOKENS.Options) options: InertiaModuleOptions,
  ) {
    this.manifest = (globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__ ?? null
    this.entryClientPath = (options.entryClientPath ?? DEFAULT_ENTRY_CLIENT_PATH).replace(/^\/+/, '')

    if (!this.isDev && !this.manifest) {
      throw new Error(
        '@stratal/inertia: production build is missing the Vite client manifest. '
        + 'This is wired by stratalInertia() in vite.config.ts — confirm it is in your plugin list '
        + 'and that the client environment built successfully before the worker environment.',
      )
    }
  }

  getHeadTags(): string {
    return this.headTags ??= this.buildHeadTags()
  }

  getScriptTags(): string {
    return this.scriptTags ??= this.buildScriptTags()
  }

  private buildHeadTags(): string {
    if (this.isDev) {
      return '<link rel="stylesheet" href="/__inertia/ssr-css" data-ssr-css />'
    }

    const tags: string[] = []
    const seen = new Set<string>()
    for (const entry of Object.values(this.manifest!)) {
      if (entry.css) {
        for (const cssFile of entry.css) {
          if (seen.has(cssFile)) continue
          seen.add(cssFile)
          tags.push(`<link rel="stylesheet" href="/${cssFile}" />`)
        }
      }
    }

    return tags.join('\n')
  }

  private buildScriptTags(): string {
    if (this.isDev) {
      return [
        '<script type="module" src="/@vite/client"></script>',
        `<script type="module">
import { createHotContext } from "/@vite/client";
const hot = createHotContext("/__ssr_css");
hot.on("vite:afterUpdate", () => {
  document.querySelectorAll("[data-ssr-css]").forEach(el => el.remove());
});
</script>`,
        `<script type="module" src="/${this.entryClientPath}"></script>`,
      ].join('\n')
    }

    const tags: string[] = []
    for (const entry of Object.values(this.manifest!)) {
      if (entry.isEntry) {
        tags.push(`<script type="module" src="/${entry.file}"></script>`)
      }
    }

    return tags.join('\n')
  }
}
