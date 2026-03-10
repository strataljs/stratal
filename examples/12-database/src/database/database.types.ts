import type { SchemaType } from '../../db/zenstack/schema'

declare module '@stratal/framework/database' {
  interface StratalDatabase {
    schemas: { main: SchemaType }
    defaultConnection: 'main'
  }
}
