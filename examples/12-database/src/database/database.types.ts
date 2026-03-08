import type { SchemaType } from '../../db/zenstack/schema'

declare module '@stratal/framework/database' {
  interface StratalDatabase {
    schema: SchemaType
    defaultConnection: 'main'
    slicing: { main: { includedModels: readonly string[] } }
  }
}
