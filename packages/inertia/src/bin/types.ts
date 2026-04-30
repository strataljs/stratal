import { existsSync } from 'node:fs'
import { watch } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { findPagesDir, runTypeGeneration } from '../generator/type-generator'
import { logger } from './logger'

export async function runTypes(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      watch: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  })

  const cwd = process.cwd()
  const pagesDir = findPagesDir(cwd)

  if (!existsSync(pagesDir)) {
    logger.fail('src/inertia/pages/ not found. Run `npx inertia install` first.')
    return 1
  }

  const result = await generate(cwd)
  if (!result) return 1

  if (values.watch === true) {
    logger.info('Watching for changes...')
    await watchForChanges(cwd)
  }

  return 0
}

async function generate(cwd: string): Promise<boolean> {
  try {
    const { outputPath, pageCount } = await runTypeGeneration(cwd)
    const relPath = relative(cwd, outputPath)
    logger.success(`Generated ${relPath} (${pageCount} page${pageCount !== 1 ? 's' : ''})`)
    return true
  } catch (err) {
    logger.fail(`Type generation failed: ${(err as Error).message}`)
    return false
  }
}

async function watchForChanges(cwd: string): Promise<void> {
  const srcDir = join(cwd, 'src')

  try {
    const watcher = watch(srcDir, { recursive: true })
    for await (const event of watcher) {
      if (event.filename && /\.(tsx|ts)$/.test(event.filename)) {
        logger.info(`Change detected: ${event.filename}`)
        await generate(cwd)
      }
    }
  } catch (err) {
    logger.fail(`Watch failed: ${(err as Error).message}`)
  }
}
