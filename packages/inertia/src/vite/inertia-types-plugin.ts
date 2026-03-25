import { existsSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import type { Plugin } from 'vite'
import { findPagesDir, runTypeGeneration } from '../generator/type-generator'

export function stratalInertiaTypes(): Plugin {
  let cwd: string
  let pagesDir: string

  return {
    name: 'stratal:inertia-types',

    configResolved(config) {
      cwd = config.root
      pagesDir = findPagesDir(cwd) + '/'
    },

    async buildStart() {
      if (!existsSync(pagesDir)) return
      try {
        await runTypeGeneration(cwd)
      } catch (error) {
        console.warn('[stratal:inertia-types] Type generation failed during build:', error)
      }
    },

    async handleHotUpdate({ file }) {
      const rel = relative(pagesDir, file)
      if (rel.startsWith('..') || isAbsolute(rel)) return
      if (!/\.(tsx|ts)$/.test(file)) return

      try {
        await runTypeGeneration(cwd)
      } catch (error) {
        console.warn('[stratal:inertia-types] Type generation failed during HMR:', error)
      }
    },
  }
}
