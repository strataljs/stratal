import type { SchemaType } from '../../db/zenstack/schema'

declare module '@stratal/framework/database' {
  interface DatabaseSchemaRegistry {
    main: SchemaType
  }

  interface DefaultDatabaseConnection {
    name: 'main'
  }
}
