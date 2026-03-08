import type { CliPlugin } from '@zenstackhq/sdk'
import { dirname, isAbsolute, join } from 'node:path'
import { generateConnectionSchemas } from './generators/connection-schema.js'
import { generateSlicingFile } from './generators/slicing.js'
import { generateTypesFile } from './generators/types.js'
import { collectConnections, validateCrossConnectionRelations } from './utils.js'

const plugin: CliPlugin = {
  name: 'Stratal Connection Plugin',
  statusText: 'Generating connection types, slicing, and migration schemas',

  generate(context) {
    const { model, schemaFile, pluginOptions } = context

    const defaultConnection = (pluginOptions.default as string | undefined) ?? 'main'
    const rawOutput = (pluginOptions.output as string | undefined) ?? './zenstack'
    const outputDir = isAbsolute(rawOutput)
      ? rawOutput
      : join(dirname(schemaFile), rawOutput)

    const connections = collectConnections(model, defaultConnection)

    if (connections.size === 0) {
      return
    }

    const warnings = validateCrossConnectionRelations(connections)
    for (const warning of warnings) {
      console.warn(`[stratal] Warning: ${warning}`)
    }

    generateTypesFile(outputDir, connections, defaultConnection)
    generateSlicingFile(outputDir, connections)
    generateConnectionSchemas(outputDir, model, connections)
  },
}

export default plugin
