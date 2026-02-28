# Project Setup Reference

## Quick Start with CLI

The fastest way to scaffold a new Stratal project:

```bash
npm create stratal -t 01-hello-world
# or
yarn create stratal -t 01-hello-world
# or
pnpm create stratal -t 01-hello-world
```

The CLI will prompt you for a project name and scaffold a ready-to-go Stratal project.

## Manual Setup

### Recommended File Structure

```
src/
  app.module.ts              # Root module
  index.ts                   # Worker entry point (StratalWorker)
  types/
    env.ts                   # StratalEnv augmentation
  config/
    app.config.ts            # Application config namespace
    database.config.ts       # Database config namespace
  users/
    users.module.ts          # Feature module
    users.controller.ts      # HTTP controller
    users.service.ts         # Business logic
    users.repository.ts      # Data access
    schemas/
      user.schema.ts         # Zod schemas
    __tests__/
      users.controller.spec.ts
      users.service.spec.ts
wrangler.jsonc
tsconfig.json
tsconfig.build.json          # If needed for build-specific settings
package.json
vitest.config.ts
vitest.setup.ts
```

## package.json

```json
{
  "name": "my-app",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "tsc",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "stratal": "^latest"
  },
  "devDependencies": {
    "@stratal/testing": "^latest",
    "@cloudflare/vitest-pool-workers": "^latest",
    "@cloudflare/workers-types": "^latest",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

**Optional peer dependencies (install only what you need):**

```bash
# Storage (S3-compatible)
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner

# Email (Resend)
npm install resend react react-dom @react-email/components

# Email (SMTP)
npm install nodemailer

# File uploads (TUS protocol)
npm install @tus/server
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "types": [
      "@cloudflare/workers-types/2023-07-01",
      "@cloudflare/vitest-pool-workers"
    ]
  },
  "include": ["src"]
}
```

**Critical settings:**
- `experimentalDecorators: true` — required for `@Module`, `@Controller`, `@Route`, `@inject`, etc.
- `emitDecoratorMetadata: true` — required for tsyringe constructor injection
- **Never use esbuild or tsup for building** — they do not support `emitDecoratorMetadata`

## wrangler.jsonc

```jsonc
{
  "name": "my-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-11-01",
  "compatibility_flags": ["nodejs_compat"],

  // Optional: KV namespace for CacheService
  "kv_namespaces": [
    { "binding": "CACHE", "id": "your-cache-kv-id" }
  ],

  // Optional: D1 database
  "d1_databases": [
    { "binding": "DATABASE", "database_name": "my-db", "database_id": "your-d1-id" }
  ],

  // Optional: R2 bucket
  "r2_buckets": [
    { "binding": "MY_BUCKET", "bucket_name": "my-bucket" }
  ],

  // Optional: Queues
  // Binding name convention: queue name → toUpperCase().replace(/-/g, '_')
  // e.g., "notifications-queue" → "NOTIFICATIONS_QUEUE"
  "queues": {
    "producers": [
      { "queue": "notifications-queue", "binding": "NOTIFICATIONS_QUEUE" }
    ],
    "consumers": [
      { "queue": "notifications-queue", "max_batch_size": 10, "max_retries": 3 }
    ]
  },

  // Optional: Cron triggers
  "triggers": {
    "crons": ["0 2 * * *", "*/5 * * * *"]
  },

  // Environment variables
  "vars": {
    "ENVIRONMENT": "development"
  }
}
```

**Optional binding:** `CACHE` (KVNamespace) — needed if you use `CacheService` for built-in KV-backed caching.

## StratalEnv Augmentation

Run `npx wrangler types` to auto-generate `Cloudflare.Env` from your `wrangler.jsonc`, then extend it:

```typescript
// src/types/env.ts
declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {}
}
```

This keeps your env types in sync with `wrangler.jsonc` automatically.

The base `StratalEnv` already includes:
- `ENVIRONMENT: string`
- `CACHE: KVNamespace`

The augmented type flows automatically through:
- `StratalWorker<Env>` — worker entry point
- `DI_TOKENS.CloudflareEnv` — inject Cloudflare env in services
- `RouterContext` — access env via the Hono context

## Worker Entry Point

```typescript
// src/index.ts
import { type ApplicationConfig } from 'stratal'
import { LogLevel } from 'stratal/logger'
import { StratalWorker } from 'stratal/worker'
import { AppModule } from './app.module'

export default class Backend extends StratalWorker {
  protected configure(): ApplicationConfig {
    return {
      module: AppModule,
      logging: {
        level: LogLevel.INFO,
        formatter: 'json',     // 'json' or 'pretty'
      },
    }
  }
}
```

### ApplicationConfig

```typescript
interface ApplicationConfig {
  module: ModuleClass | DynamicModule   // Root module
  logging?: {
    level?: LogLevel                     // DEBUG, INFO, WARN, ERROR
    formatter?: 'json' | 'pretty'       // Log output format
  }
}
```

## Vitest Configuration

```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
})
```

```typescript
// vitest.setup.ts
import 'reflect-metadata'
```

The `reflect-metadata` import is **required** — tsyringe uses it for constructor parameter type reflection. Without it, `@inject()` decorators will not work.

## Root Module Example

```typescript
// src/app.module.ts
import { Module } from 'stratal/module'
import { OpenAPIModule } from 'stratal/openapi'
import { ConfigModule } from 'stratal/config'
import { I18nModule } from 'stratal/i18n'
import { appConfig } from './config/app.config'
import { UsersModule } from './users/users.module'
import { OrdersModule } from './orders/orders.module'

@Module({
  imports: [
    ConfigModule.forRoot({ load: [appConfig] }),
    I18nModule.forRoot({
      defaultLocale: 'en',
      messages: { en: enMessages },
    }),
    OpenAPIModule.forRoot({
      info: { title: 'My API', version: '1.0.0' },
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    }),
    UsersModule,
    OrdersModule,
  ],
})
export class AppModule {}
```
