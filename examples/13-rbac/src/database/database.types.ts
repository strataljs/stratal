import type { SchemaType } from '../../db/zenstack/schema'

declare module '@stratal/framework/database' {
  interface DatabaseSchema { type: SchemaType }
  interface DatabaseSlicingRegistry {
    main: { includedModels: readonly string[] }
  }
  interface DefaultDatabaseConnection {
    name: 'main'
  }
}
