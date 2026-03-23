import { existsSync } from 'node:fs'
import type { Plugin } from 'vite'
import { findPagesDir, runTypeGeneration } from '../generator/type-generator'

export function stratalInertiaTypes(): Plugin {
  let cwd: string
  let pagesDir: string

  return {
    name: 'stratal:inertia-types',

    configResolved(config) {
      cwd = config.root
      pagesDir = findPagesDir(cwd)
    },

    async buildStart() {
      if (!existsSync(pagesDir)) return
      try {
        await runTypeGeneration(cwd)
      } catch {
        // Silently skip if type generation fails during build
      }
    },

    async handleHotUpdate({ file }) {
      if (!file.startsWith(pagesDir)) return
      if (!/\.(tsx|ts)$/.test(file)) return

      try {
        await runTypeGeneration(cwd)
      } catch {
        // Silently skip if type generation fails during HMR
      }
    },
  }
}
