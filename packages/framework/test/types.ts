import type { SchemaType } from './zenstack/schema'

declare module '@stratal/framework/database' {
  interface DatabaseSchema { type: SchemaType }
  interface DatabaseSlicingRegistry {
    main: { includedModels: readonly string[] }
  }
  interface DefaultDatabaseConnection {
    name: 'main'
  }
}

declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {
  }
}
