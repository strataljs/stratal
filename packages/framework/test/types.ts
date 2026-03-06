import type { SchemaType } from './zenstack/schema'

declare module '@stratal/framework/database' {
  interface DatabaseSchemaRegistry {
    main: SchemaType
  }
  interface DefaultDatabaseConnection {
    name: 'main'
  }
}

declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {
  }
}
