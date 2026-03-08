import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import chalk from 'chalk'
import { loadDocument } from '@zenstackhq/language'
import { collectConnections } from '../../plugin/utils.js'
import { generateConnectionSchemas } from '../../plugin/generators/connection-schema.js'

export interface PushOptions {
  connection?: string
  all?: boolean
  schema?: string
  cleanup?: boolean
}

export async function pushCommand(options: PushOptions): Promise<void> {
  const schemaPath = options.schema ?? 'schema.zmodel'

  if (!existsSync(schemaPath)) {
    console.error(chalk.red(`Schema file not found: ${schemaPath}`))
    process.exit(1)
  }

  const result = await loadDocument(schemaPath)
  if (!result.success) {
    console.error(chalk.red('Failed to load schema:'))
    for (const err of result.errors) {
      console.error(chalk.red(`  ${err}`))
    }
    process.exit(1)
  }

  const model = result.model
  const connections = collectConnections(model, 'main')
  const outputDir = dirname(schemaPath)

  generateConnectionSchemas(outputDir, model, connections)

  const connectionNames = options.all
    ? [...connections.keys()]
    : options.connection
      ? [options.connection]
      : []

  if (connectionNames.length === 0) {
    console.error(chalk.red('Specify --connection <name> or --all'))
    process.exit(1)
  }

  let hasError = false

  for (const connName of connectionNames) {
    if (!connections.has(connName)) {
      console.error(chalk.red(`Unknown connection: ${connName}`))
      hasError = true
      continue
    }

    const connSchemaPath = join(outputDir, 'connections', connName, 'schema.zmodel')

    console.log(chalk.blue(`\n[${connName}] Running db push...`))

    try {
      execSync(`zen db push --schema ${connSchemaPath}`, { stdio: 'inherit' })
      console.log(chalk.green(`[${connName}] db push completed`))
    } catch {
      console.error(chalk.red(`[${connName}] db push failed`))
      hasError = true
    }
  }

  if (options.cleanup !== false && !hasError) {
    for (const connName of connectionNames) {
      const connSchemaFile = join(outputDir, 'connections', connName, 'schema.zmodel')
      if (existsSync(connSchemaFile)) {
        rmSync(connSchemaFile)
      }
    }
  }

  if (hasError) {
    process.exit(1)
  }
}
