import type { SchemaType } from './zenstack/schema'

declare module '@stratal/framework/database' {
  interface StratalDatabase {
    schemas: { main: SchemaType }
    defaultConnection: 'main'
  }
}

declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {
  }
}
