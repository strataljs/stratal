import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
export interface TempViteConfigOptions {
  cwd: string
  server?: { port?: number; host?: boolean }
  outDir?: string
  persistTo?: string
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

  const cloudflareArgs = options.persistTo
    ? `{ persistState: { path: ${JSON.stringify(options.persistTo)} } }`
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
  plugins: [
    cloudflare(${cloudflareArgs}),
    ...(inertiaPlugin ? [inertiaPlugin] : []),
    ...stratalInertia(),
  ],
  publicDir: '${join(options.cwd, 'src', 'inertia', 'public').replace(/\\/g, '/')}',
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
