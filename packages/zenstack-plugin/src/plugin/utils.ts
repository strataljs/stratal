import type { DataModel, DataSource, Enum, Model } from '@zenstackhq/language/ast'
import { getAttribute, hasAttribute } from '@zenstackhq/language/utils'
import { dirname, isAbsolute, join } from 'node:path'

export interface ConnectionInfo {
  name: string
  provider?: string
  models: DataModel[]
  modelNames: string[]
}

export function collectConnections(
  model: Model,
  defaultConnection: string,
): Map<string, ConnectionInfo> {
  const connections = new Map<string, ConnectionInfo>()

  for (const decl of model.declarations) {
    if (decl.$type !== 'DataModel') continue
    const dataModel = decl

    let connectionName = defaultConnection
    let provider: string | undefined

    if (hasAttribute(dataModel, '@@connection')) {
      const attr = getAttribute(dataModel, '@@connection')
      if (attr && attr.args.length > 0) {
        const nameArg = attr.args[0]
        if (nameArg.value.$type === 'StringLiteral') {
          connectionName = (nameArg.value as { value: string }).value
        }

        if (attr.args.length > 1) {
          const providerArg = attr.args[1]
          if (providerArg.value.$type === 'StringLiteral') {
            provider = (providerArg.value as { value: string }).value
          }
        }
      }
    }

    let conn = connections.get(connectionName)
    if (!conn) {
      conn = { name: connectionName, provider, models: [], modelNames: [] }
      connections.set(connectionName, conn)
    }

    if (provider && !conn.provider) {
      conn.provider = provider
    }

    conn.models.push(dataModel)
    conn.modelNames.push(dataModel.name)
  }

  return connections
}

export function getDatasource(model: Model): DataSource | undefined {
  for (const decl of model.declarations) {
    if (decl.$type === 'DataSource') {
      return decl
    }
  }
  return undefined
}

export function getDatasourceProvider(datasource: DataSource): string | undefined {
  for (const field of datasource.fields) {
    if (field.name === 'provider') {
      if (field.value.$type === 'StringLiteral') {
        return (field.value as unknown as { value: string }).value
      }
    }
  }
  return undefined
}

export function getEnumsForModels(model: Model, modelNames: string[]): Enum[] {
  const enums: Enum[] = []
  const enumNames = new Set<string>()

  for (const decl of model.declarations) {
    if (decl.$type !== 'DataModel') continue
    const dataModel = decl

    if (!modelNames.includes(dataModel.name)) continue

    for (const field of dataModel.fields) {
      if (field.type.reference?.ref?.$type === 'Enum') {
        const enumDecl = field.type.reference.ref
        if (!enumNames.has(enumDecl.name)) {
          enumNames.add(enumDecl.name)
          enums.push(enumDecl)
        }
      }
    }
  }

  return enums
}

export function stripConnectionAttribute(modelText: string): string {
  return modelText.replace(/\s*@@connection\([^)]*\)/g, '')
}

export function toUpperSnakeCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase()
}

export function getPluginOutputDir(model: Model, schemaPath: string): string {
  for (const decl of model.declarations) {
    if (decl.$type !== 'Plugin') continue

    const plugin = decl as { fields: { name: string; value: { $type: string; value?: string } }[] }
    let isStratalPlugin = false
    let outputValue: string | undefined

    for (const field of plugin.fields) {
      if (field.name === 'provider' && field.value.$type === 'StringLiteral') {
        if ((field.value as { value: string }).value === '@stratal/zenstack-plugin') {
          isStratalPlugin = true
        }
      }
      if (field.name === 'output' && field.value.$type === 'StringLiteral') {
        outputValue = (field.value as { value: string }).value
      }
    }

    if (isStratalPlugin && outputValue) {
      return isAbsolute(outputValue) ? outputValue : join(dirname(schemaPath), outputValue)
    }
  }

  return dirname(schemaPath)
}

export function validateCrossConnectionRelations(
  connections: Map<string, ConnectionInfo>,
): string[] {
  const warnings: string[] = []
  const modelToConnection = new Map<string, string>()

  for (const [connName, connInfo] of connections) {
    for (const modelName of connInfo.modelNames) {
      modelToConnection.set(modelName, connName)
    }
  }

  for (const [connName, connInfo] of connections) {
    for (const dataModel of connInfo.models) {
      for (const field of dataModel.fields) {
        if (field.type.reference?.ref?.$type === 'DataModel') {
          const refModel = field.type.reference.ref
          const refConnection = modelToConnection.get(refModel.name)
          if (refConnection && refConnection !== connName) {
            warnings.push(
              `Model "${dataModel.name}" (connection "${connName}") has a relation to "${refModel.name}" (connection "${refConnection}"). Cross-connection relations cannot have foreign keys enforced at the database level.`
            )
          }
        }
      }
    }
  }

  return warnings
}
