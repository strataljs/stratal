import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface TempClientViteConfigOptions {
  cwd: string
  entry?: string
  outDir?: string
}

/**
 * Emits a standalone Vite config for building the Inertia browser bundle.
 *
 * This runs as a separate `vite build` invocation BEFORE the worker build so
 * the worker's `stratal:inertia-inject-manifest` plugin has a finished
 * `<outDir>/.vite/manifest.json` to read. `@cloudflare/vite-plugin` builds its
 * environments in parallel, which made a single-config build racy — splitting
 * the two phases removes the race entirely and keeps each build minimal.
 */
export function writeTempClientViteConfig(options: TempClientViteConfigOptions): string {
  const configDir = join(options.cwd, 'node_modules', '.stratal')
  const configPath = join(configDir, 'vite.client.config.mjs')
  mkdirSync(dirname(configPath), { recursive: true })

  const entry = (options.entry ?? 'src/inertia/app.tsx').replace(/\\/g, '/')
  const outDir = (options.outDir ?? 'dist/client').replace(/\\/g, '/')
  const hasUserConfig = existsSync(join(options.cwd, 'vite.config.ts'))
  const publicDir = join(options.cwd, 'src', 'inertia', 'public').replace(/\\/g, '/')

  const content = `
import { mergeConfig } from 'vite'

const baseConfig = {
  publicDir: '${publicDir}',
  build: {
    outDir: '${outDir}',
    manifest: true,
    emptyOutDir: true,
    rollupOptions: {
      input: { app: '${entry}' },
    },
  },
}

${hasUserConfig
      ? `const userModule = await import('${join(options.cwd, 'vite.config.ts').replace(/\\/g, '/')}')
const userConfig = userModule.default ?? userModule
export default mergeConfig(userConfig, baseConfig)`
      : 'export default baseConfig'
    }
`

  writeFileSync(configPath, content, 'utf-8')
  return configPath
}
