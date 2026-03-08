import type { SchemaType } from './zenstack/schema'

declare module '@stratal/framework/database' {
  interface StratalDatabase {
    schema: SchemaType
    defaultConnection: 'main'
    slicing: { main: { includedModels: readonly string[] } }
  }
}

declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {
  }
}
