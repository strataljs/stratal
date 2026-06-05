import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
export interface TempViteConfigOptions {
  cwd: string
  server?: { port?: number; host?: boolean }
  outDir?: string
  persistTo?: string
  /**
   * Worker debugger inspector port passed to `@cloudflare/vite-plugin`.
   * Pass a distinct number per worker to avoid the `EADDRINUSE` race that
   * happens when several Inertia workers boot concurrently and all probe the
   * default port (9229). Pass `false` to disable the inspector entirely.
   * Left `undefined` preserves the plugin's default auto-pick behaviour.
   */
  inspectorPort?: number | false
  /**
   * Path (relative to `cwd`) to the Vite client manifest the worker bundle
   * should inline. Defaults to `dist/client/.vite/manifest.json`, matching
   * what `quarry inertia:build` emits in phase 1.
   */
  clientManifestPath?: string
}

export function writeTempViteConfig(options: TempViteConfigOptions): string {
  const configDir = join(options.cwd, 'node_modules', '.stratal')
  const configPath = join(configDir, 'vite.config.mjs')
  mkdirSync(dirname(configPath), { recursive: true })

  const hasUserConfig = existsSync(join(options.cwd, 'vite.config.ts'))

  const serverConfig = options.server
    ? `server: { port: ${options.server.port}, host: ${options.server.host ? 'true' : 'undefined'} },`
    : ''

  const outDirConfig = options.outDir
    ? `outDir: '${options.outDir}',`
    : ''

  const cloudflareOptions: string[] = []
  if (options.persistTo) {
    cloudflareOptions.push(`persistState: { path: ${JSON.stringify(options.persistTo)} }`)
  }
  if (options.inspectorPort !== undefined) {
    cloudflareOptions.push(`inspectorPort: ${options.inspectorPort === false ? 'false' : options.inspectorPort}`)
  }
  const cloudflareArgs = cloudflareOptions.length ? `{ ${cloudflareOptions.join(', ')} }` : ''

  const stratalArgs = options.clientManifestPath
    ? `{ clientManifestPath: ${JSON.stringify(options.clientManifestPath)} }`
    : ''

  const content = `
import { mergeConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { stratalInertia } from '@stratal/inertia/vite'

let inertiaPlugin = null
try {
  const mod = await import('@inertiajs/vite')
  const inertia = mod.default ?? mod
  inertiaPlugin = inertia()
} catch {}

const baseConfig = {
  publicDir: 'src/inertia/public',
  plugins: [
    cloudflare(${cloudflareArgs}),
    ...(inertiaPlugin ? [inertiaPlugin] : []),
    ...stratalInertia(${stratalArgs}),
  ],
  build: {
    ${outDirConfig}
  },
  ${serverConfig}
}

${hasUserConfig
      ? `const userModule = await import('${join(options.cwd, 'vite.config.ts').replace(/\\/g, '/')}')
const userConfig = userModule.default ?? userModule
export default mergeConfig(baseConfig, userConfig)`
      : 'export default baseConfig'
    }
`

  writeFileSync(configPath, content, 'utf-8')
  return configPath
}
