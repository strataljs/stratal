import { Transient } from 'stratal/di'
import type { ViteManifest } from '../types'

@Transient()
export class ManifestService {
  private manifest: ViteManifest | null = null
  private devServerUrl: string | null = null

  setManifest(manifest: ViteManifest): void {
    this.manifest = manifest
  }

  setDevServerUrl(url: string): void {
    this.devServerUrl = url
  }

  getHeadTags(): string {
    if (this.devServerUrl) {
      return ''
    }

    if (!this.manifest) {
      return ''
    }

    const tags: string[] = []
    for (const entry of Object.values(this.manifest)) {
      if (entry.css) {
        for (const cssFile of entry.css) {
          tags.push(`<link rel="stylesheet" href="/${cssFile}" />`)
        }
      }
    }

    return tags.join('\n')
  }

  getScriptTags(): string {
    if (this.devServerUrl) {
      return [
        `<script type="module" src="${this.devServerUrl}/@vite/client"></script>`,
        `<script type="module" src="${this.devServerUrl}/src/inertia/app.tsx"></script>`,
      ].join('\n')
    }

    if (!this.manifest) {
      return ''
    }

    const tags: string[] = []
    for (const entry of Object.values(this.manifest)) {
      if (entry.isEntry) {
        tags.push(`<script type="module" src="/${entry.file}"></script>`)
      }
    }

    return tags.join('\n')
  }
}
