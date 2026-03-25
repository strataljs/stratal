import { existsSync } from 'node:fs'
import { watch } from 'node:fs/promises'
import { relative } from 'node:path'
import { Command } from 'stratal/quarry'
import { findPagesDir, runTypeGeneration } from '../generator/type-generator'

export class InertiaTypesCommand extends Command {
  static command = 'inertia:types {--watch : Watch for changes and regenerate}'
  static description = 'Generate Inertia.js page type definitions'

  async handle(): Promise<number | undefined> {
    const cwd = process.cwd()
    const pagesDir = findPagesDir(cwd)

    if (!existsSync(pagesDir)) {
      this.fail('src/inertia/pages/ not found. Run `quarry inertia:install` first.')
      return 1
    }

    const result = await this.generate(cwd)
    if (!result) return 1

    if (this.boolean('watch')) {
      this.info('Watching for changes...')
      await this.watchForChanges(cwd, pagesDir)
    }

    return 0
  }

  private async generate(cwd: string): Promise<boolean> {
    try {
      const { outputPath, pageCount } = await runTypeGeneration(cwd)
      const relPath = relative(cwd, outputPath)
      this.success(`Generated ${relPath} (${pageCount} page${pageCount !== 1 ? 's' : ''})`)
      return true
    } catch (err) {
      this.fail(`Type generation failed: ${(err as Error).message}`)
      return false
    }
  }

  private async watchForChanges(cwd: string, pagesDir: string): Promise<void> {
    try {
      const watcher = watch(pagesDir, { recursive: true })
      for await (const event of watcher) {
        if (event.filename && /\.(tsx|ts)$/.test(event.filename)) {
          this.info(`Change detected: ${event.filename}`)
          await this.generate(cwd)
        }
      }
    } catch (err) {
      this.fail(`Watch failed: ${(err as Error).message}`)
    }
  }
}
