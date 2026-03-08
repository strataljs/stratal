import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { loadDocument } from '@zenstackhq/language'
import { collectConnections, getPluginOutputDir } from '../../plugin/utils.js'
import { generateConnectionSchemas } from '../../plugin/generators/connection-schema.js'

export interface PushOptions {
  connection?: string
  allConnections?: boolean
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
  const outputDir = getPluginOutputDir(model, schemaPath)

  const connectionNames = options.allConnections
    ? [...connections.keys()]
    : options.connection
      ? [options.connection]
      : []

  if (connectionNames.length === 0) {
    console.error(chalk.red('Specify --connection <name> or --all-connections'))
    process.exit(1)
  }

  for (const connName of connectionNames) {
    if (!connections.has(connName)) {
      console.error(chalk.red(`Unknown connection: ${connName}`))
      process.exit(1)
    }
  }

  const targetConnections = new Map(
    connectionNames.map(name => [name, connections.get(name)!]),
  )

  generateConnectionSchemas(outputDir, model, targetConnections)

  let hasError = false

  for (const connName of connectionNames) {
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
