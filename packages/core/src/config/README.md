# Config System

NestJS-style configuration system with namespace support, dot notation, and runtime overrides.

## Overview

The config system uses `registerAs()` to create typed config namespaces that are injected via dependency injection. Each namespace receives the Cloudflare `Env` object and returns a typed config object.

**Key Features:**
- ✅ `registerAs()` for creating typed config namespaces
- ✅ Auto-derived injection tokens (`namespace.KEY`)
- ✅ Dot notation access via `ConfigService`
- ✅ Runtime overrides via `config.set()`
- ✅ Optional Zod schema validation
- ✅ Framework is environment-agnostic (app layer reads env vars)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Application Layer (apps/backend)                                 │
│                                                                  │
│  1. Define config namespaces with registerAs()                  │
│     const databaseConfig = registerAs('database', (env) => ...) │
│                                                                  │
│  2. Register in CoreModule via ConfigModule.forRoot()           │
│     ConfigModule.forRoot({                                      │
│       load: [databaseConfig, emailConfig, ...],                 │
│       validateSchema: AppConfigSchema                           │
│     })                                                           │
│                                                                  │
│  3. Access config in services via ConfigService                 │
│     @inject(CONFIG_TOKENS.ConfigService) config: IConfigService │
│     this.config.get('database.url')                             │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ Framework Layer (packages/core)                               │
│                                                                  │
│  ConfigModule.forRoot()                                         │
│      ↓ Resolves DI_TOKENS.CloudflareEnv                         │
│      ↓ Calls each namespace factory with env                    │
│      ↓ Validates merged config (optional)                       │
│      ↓ Initializes ConfigService                                │
│                                                                  │
│  ConfigService (runtime)                                         │
│      - Dot notation get/set                                     │
│      - Runtime overrides for tenancy                            │
│      - Reset to original values                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Define Config Namespace

See [apps/backend/src/config/database.config.ts](../../../../apps/backend/src/config/database.config.ts)

```typescript
import { registerAs } from 'stratal/config'

export const databaseConfig = registerAs('database', (env: Env) => ({
  url: env.DATABASE_URL || '',
  maxConnections: parseInt(env.DATABASE_MAX_CONNECTIONS || '10', 10),
}))

export type DatabaseConfig = ReturnType<typeof databaseConfig.factory>
```

### 2. Register in Module

See [apps/backend/src/core/index.ts](../../../../apps/backend/src/core/index.ts)

```typescript
import { ConfigModule } from 'stratal/config'
import { databaseConfig, emailConfig } from '../config'

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [databaseConfig, emailConfig, storageConfig, ...],
      validateSchema: AppConfigSchema, // Optional Zod schema
    }),
  ],
})
export class CoreModule {}
```

### 3. Inject and Use

For services and controllers that need **runtime-overridable config** (e.g., tenant-specific values), use `ConfigService`:

```typescript
import { inject } from 'tsyringe'
import { Transient, CONFIG_TOKENS, type IConfigService } from 'stratal'

@Transient()
export class MyService {
  constructor(
    @inject(CONFIG_TOKENS.ConfigService)
    private readonly config: IConfigService
  ) {}

  getConnectionUrl(): string {
    return this.config.get('database.url')
  }
}
```

> **Note:** Use namespace injection (`@inject(myConfig.KEY)`) only in `forRootAsync` patterns where static config is needed for module initialization. See [Module Integration](#module-integration-forrootasync).

## API Reference

### registerAs()

Creates a typed config namespace with auto-derived injection token.

```typescript
const myConfig = registerAs('namespace', (env: Env) => ({
  setting: env.MY_SETTING,
}))

// Returns:
// myConfig.KEY      - Injection token (Symbol)
// myConfig.namespace - 'namespace'
// myConfig.factory   - (env) => config
// myConfig.asProvider() - Returns provider for module registration
```

### ConfigModule.forRoot()

Registers all config namespaces and initializes ConfigService.

```typescript
ConfigModule.forRoot({
  load: [databaseConfig, emailConfig, ...],
  validateSchema: AppConfigSchema, // Optional
})
```

### ConfigService

Generic config service with dot notation and runtime overrides.

```typescript
// Inject via token
@inject(CONFIG_TOKENS.ConfigService)
private readonly config: IConfigService

// Get with dot notation
const url = config.get('database.url')
const fromName = config.get('email.from.name')

// Set at runtime (tenant overrides)
config.set('email.from.name', tenant.schoolName)

// Reset to original
config.reset('email.from.name') // Reset specific path
config.reset() // Reset entire config

// Check if path exists
if (config.has('feature.enabled')) { ... }

// Get entire config
const all = config.all()
```

## App-Specific Methods

App-specific methods like `isDevelopment()`, `buildLandlordURL()` are provided by `AppConfigService` in the application layer.

See [apps/backend/src/config/app-config.service.ts](../../../../apps/backend/src/config/app-config.service.ts)

```typescript
import { APP_CONFIG_TOKENS } from '../config/app-config.tokens'

@Transient()
export class MyController {
  constructor(
    @inject(APP_CONFIG_TOKENS.AppConfigService)
    private readonly appConfig: AppConfigService
  ) {}

  async handle(): Promise<void> {
    if (this.appConfig.isDevelopment()) {
      // Dev-only logic
    }

    const url = this.appConfig.buildLandlordURL('/callback')
  }
}
```

## Module Integration (forRootAsync)

Framework modules use `forRootAsync` to receive config from namespaces.

```typescript
@Module({
  imports: [
    // Storage with config from namespace
    StorageModule.forRootAsync({
      inject: [storageConfig.KEY],
      useFactory: (storage) => ({
        storage: storage.storage,
        defaultStorageDisk: storage.defaultStorageDisk,
      }),
    }),

    // Email with config from namespace
    EmailModule.forRootAsync({
      inject: [emailConfig.KEY],
      useFactory: (email) => ({
        provider: email.provider,
        from: email.from,
        queue: email.queue,
      }),
    }),
  ],
})
```

## Runtime Overrides

Use `config.set()` for tenant-specific configuration. Works anywhere in the request lifecycle.

```typescript
// In middleware
async handle(ctx: RouterContext, next: () => Promise<void>) {
  const tenant = await this.getTenant(ctx)

  // Override config for this request
  this.config.set('email.from.name', tenant.schoolName)

  await next()
}

// In service - reflects middleware overrides
async sendEmail() {
  const fromName = this.config.get('email.from.name') // Tenant's school name
}
```

## Testing

### Integration Tests

Each test creates its own testing module. Config is loaded via `ConfigModule.forRoot()`.

```typescript
import { Test } from '@stratal/testing'
import { MyModule } from './my.module'

describe('MyService', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [MyModule],
    }).compile()
  })

  it('should use config', () => {
    const service = module.get(MY_TOKENS.MyService)
    // Service has access to config via injected namespaces
  })
})
```

### Accessing Config in Tests

```typescript
import { CONFIG_TOKENS, type IConfigService } from 'stratal'

const config = module.get<IConfigService>(CONFIG_TOKENS.ConfigService)
expect(config.get('database.url')).toBeDefined()
```

## Adding New Configuration

### 1. Create Namespace File

```typescript
// apps/backend/src/config/new-feature.config.ts
import { registerAs } from 'stratal/config'

export const newFeatureConfig = registerAs('newFeature', (env: Env) => ({
  apiKey: env.NEW_FEATURE_API_KEY || '',
  enabled: env.NEW_FEATURE_ENABLED === 'true',
  timeout: parseInt(env.NEW_FEATURE_TIMEOUT || '5000', 10),
}))

export type NewFeatureConfig = ReturnType<typeof newFeatureConfig.factory>
```

### 2. Add to allConfigs

```typescript
// apps/backend/src/config/index.ts
export * from './new-feature.config'

export const allConfigs = [
  // ... existing configs
  newFeatureConfig,
]
```

### 3. Update Validation Schema (Optional)

```typescript
// apps/backend/src/config/app-config.schema.ts
export const AppConfigSchema = z.object({
  // ... existing schemas
  newFeature: z.object({
    apiKey: z.string(),
    enabled: z.boolean(),
    timeout: z.number(),
  }),
})
```

### 4. Add Environment Variables

- Add to `.dev.vars.example` for local development
- Set in production via `wrangler secret put` (sensitive) or `wrangler.jsonc` (non-sensitive)

## Troubleshooting

### Config validation errors

```
ConfigValidationError: Configuration validation failed
```

**Solution:** Check that all required environment variables are set and match the schema.

### Type errors with config access

```
Argument of type '"invalid.path"' is not assignable
```

**Solution:** Ensure you're using the correct dot notation path matching your namespace structure:

```typescript
// Config namespace defines: { database: { url: string } }
// Correct path:
this.config.get('database.url')
```

### ConfigService not initialized

```
Error: ConfigService not initialized
```

**Solution:** Ensure `ConfigModule.forRoot()` is imported in your module chain.

## See Also

- [apps/backend/src/config/](../../../../apps/backend/src/config/) - Application config implementation
- [apps/backend/src/config/app-config.service.ts](../../../../apps/backend/src/config/app-config.service.ts) - App-specific config methods
