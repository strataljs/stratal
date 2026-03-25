import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'
import { findPagesDir, runTypeGeneration } from '../generator/type-generator'

const INERTIA_CALL_PATTERN = /ctx\.inertia\(|\.share\(|ctx\.flash\(|ctx\.defer\(|ctx\.optional\(|ctx\.merge\(|ctx\.once\(|ctx\.always\(/

export function stratalInertiaTypes(): Plugin {
  let cwd: string
  let pagesDir: string
  let srcDir: string

  return {
    name: 'stratal:inertia-types',

    configResolved(config) {
      cwd = config.root
      pagesDir = findPagesDir(cwd) + '/'
      srcDir = join(cwd, 'src') + '/'
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
      if (!/\.(tsx|ts)$/.test(file)) return

      const relToSrc = relative(srcDir, file)
      const isInSrc = !relToSrc.startsWith('..')

      if (!isInSrc) return

      // Page files always trigger regeneration
      const relToPages = relative(pagesDir, file)
      const isPageFile = !relToPages.startsWith('..')

      if (!isPageFile) {
        // For non-page files, only regenerate if they contain inertia-related calls
        try {
          const content = readFileSync(file, 'utf-8')
          if (!INERTIA_CALL_PATTERN.test(content)) return
        } catch {
          return
        }
      }

      try {
        await runTypeGeneration(cwd)
      } catch (error) {
        console.warn('[stratal:inertia-types] Type generation failed during HMR:', error)
      }
    },
  }
}
