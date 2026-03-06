import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'

export default function setup() {
  const schemaPath = resolve(import.meta.dirname, 'schema.zmodel')
  const zenstackBin = resolve(import.meta.dirname, '../../../node_modules/.bin/zenstack')
  const nodeBinDir = dirname(process.execPath)

  execFileSync(zenstackBin, ['db', 'push', '--force-reset', `--schema=${schemaPath}`, '--accept-data-loss'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${nodeBinDir}:${process.env.PATH ?? ''}`,
    },
  })
}
