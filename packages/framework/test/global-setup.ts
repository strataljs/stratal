import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'

import { createTestDatabaseGlobalSetup } from '@stratal/testing/database'

const schemaPath = resolve(import.meta.dirname, 'schema.zmodel')
const zenstackBin = resolve(import.meta.dirname, '../../../node_modules/.bin/zenstack')
const nodeBinDir = dirname(process.execPath)

/**
 * In 'database' mode `connectionString` targets the template database; in
 * 'shared' mode it targets the base database. Either way, ZenStack reads the
 * datasource url from `DATABASE_URL`, so we push the schema against it.
 */
export default createTestDatabaseGlobalSetup({
  isolation: 'database',
  // Fingerprint source: the template is rebuilt only when the schema changes.
  schema: schemaPath,
  migrate: (connectionString) => {
    execFileSync(zenstackBin, ['db', 'push', '--force-reset', `--schema=${schemaPath}`, '--accept-data-loss'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        PATH: `${nodeBinDir}:${process.env.PATH ?? ''}`,
      },
    })
  },
})
