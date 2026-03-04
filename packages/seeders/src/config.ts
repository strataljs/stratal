import path from 'node:path'
import type { SeederConfig } from './types.js'

export function resolveConfig(): SeederConfig {
  const cwd = process.cwd()

  return {
    cwd,
    wranglerPath: path.join(cwd, 'wrangler.jsonc'),
  }
}
