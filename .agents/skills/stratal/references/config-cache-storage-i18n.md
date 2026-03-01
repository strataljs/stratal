# Config, Cache, Storage, and I18n Reference

## Configuration Module

### registerAs — Typed Config Namespaces

```typescript
import { registerAs, type InferConfigType } from 'stratal/config'

export const databaseConfig = registerAs('database', (env: StratalEnv) => ({
  url: env.DATABASE_URL,
  maxConnections: parseInt(env.DATABASE_MAX_CONNECTIONS || '10'),
  debug: env.ENVIRONMENT === 'development',
}))

// Type-safe config type extraction
export type DatabaseConfig = InferConfigType<typeof databaseConfig>
// { url: string; maxConnections: number; debug: boolean }
```

`registerAs()` returns a `ConfigNamespace` with:
- `KEY` — Symbol-based DI token (`Symbol('CONFIG:database')`)
- `namespace` — The namespace string (`'database'`)
- `factory(env)` — Factory function that creates config from env
- `asProvider()` — Returns a `FactoryProvider` for use in module `providers`

### ConfigModule Setup

```typescript
import { ConfigModule } from 'stratal/config'
import { databaseConfig } from './config/database.config'
import { appConfig } from './config/app.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [databaseConfig, appConfig],
    }),
  ],
})
export class AppModule {}
```

### Injecting Config

```typescript
import { inject, Transient } from 'stratal/di'
import { databaseConfig, type DatabaseConfig } from './config/database.config'

@Transient()
export class DatabaseService {
  constructor(
    @inject(databaseConfig.KEY) private readonly config: DatabaseConfig,
  ) {}

  connect() {
    console.log(this.config.url)  // Type-safe access
  }
}
```

### Config Tokens

```typescript
import { CONFIG_TOKENS } from 'stratal/config'

CONFIG_TOKENS.ConfigService  // Symbol('ConfigService')
```

## Cache Module

The CacheModule is **auto-registered** by the framework — no explicit import needed. It uses the `CACHE` KV namespace binding from `wrangler.jsonc`.

### CacheService API

```typescript
import { CACHE_TOKENS } from 'stratal/cache'

@Transient()
export class ProductService {
  constructor(
    @inject(CACHE_TOKENS.CacheService) private readonly cache: CacheService,
  ) {}

  async getProduct(id: string) {
    // Try cache first
    const cached = await this.cache.get(`product:${id}`, 'json')
    if (cached) return cached

    // Fetch from DB
    const product = await this.fetchFromDb(id)

    // Cache for 1 hour
    await this.cache.put(`product:${id}`, JSON.stringify(product), {
      expirationTtl: 3600,
    })

    return product
  }
}
```

### CacheService Methods

```typescript
class CacheService {
  // GET — type can be 'text' | 'json' | 'arrayBuffer' | 'stream'
  async get<T>(key: string, type?: string): Promise<T | null>

  // GET with metadata
  async getWithMetadata<T, M>(key: string, type?: string): Promise<{ value: T | null; metadata: M | null }>

  // PUT — value can be string | ArrayBuffer | ArrayBufferView | ReadableStream
  async put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVNamespacePutOptions): Promise<void>

  // DELETE
  async delete(key: string): Promise<void>

  // LIST
  async list<M>(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult<M>>

  // Use a different KV binding
  withBinding(kv: KVNamespace): CacheService
}
```

**KVNamespacePutOptions:**
- `expirationTtl?: number` — TTL in seconds
- `expiration?: number` — Unix timestamp
- `metadata?: Record<string, unknown>` — Arbitrary metadata

### Cache Tokens

```typescript
import { CACHE_TOKENS } from 'stratal/cache'

CACHE_TOKENS.CacheService  // Symbol('CacheService')
```

### Required Wrangler Binding

```jsonc
// wrangler.jsonc
{
  "kv_namespaces": [
    { "binding": "CACHE", "id": "your-kv-namespace-id" }
  ]
}
```

## Storage Module

### StorageModule Setup

```typescript
import { StorageModule } from 'stratal/storage'

StorageModule.forRoot({
  storage: [
    {
      disk: 'uploads',
      driver: 's3',
      bucket: 'my-uploads-bucket',
      region: 'auto',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    },
  ],
  defaultStorageDisk: 'uploads',
  presignedUrl: {
    defaultExpiry: 3600,   // 1 hour
    maxExpiry: 86400,      // 24 hours
  },
})
```

Async configuration:

```typescript
StorageModule.forRootAsync({
  inject: [storageConfig.KEY],
  useFactory: (config) => ({
    storage: config.disks,
    defaultStorageDisk: config.defaultDisk,
    presignedUrl: config.presignedUrl,
  }),
})
```

### StorageService API

```typescript
import { STORAGE_TOKENS } from 'stratal/storage'

@Transient()
export class FileService {
  constructor(
    @inject(STORAGE_TOKENS.StorageService) private readonly storage: StorageService,
  ) {}

  async uploadAvatar(file: ReadableStream, userId: string) {
    return this.storage.upload(file, `avatars/${userId}.jpg`, {
      contentType: 'image/jpeg',
      size: file.size,
    })
  }
}
```

### StorageService Methods

```typescript
class StorageService {
  // Upload a file
  async upload(body: StreamingBlobPayloadInputTypes, relativePath: string, options: UploadOptions, disk?: string): Promise<UploadResult>

  // Download a file
  async download(relativePath: string, disk?: string): Promise<DownloadResult>

  // Delete a file
  async delete(relativePath: string, disk?: string): Promise<void>

  // Check if file exists
  async exists(relativePath: string, disk?: string): Promise<boolean>

  // Presigned URLs (for client-side uploads/downloads)
  async getPresignedDownloadUrl(relativePath: string, expiresIn?: number, disk?: string): Promise<PresignedUrlResult>
  async getPresignedUploadUrl(relativePath: string, expiresIn?: number, disk?: string): Promise<PresignedUrlResult>
  async getPresignedDeleteUrl(relativePath: string, expiresIn?: number, disk?: string): Promise<PresignedUrlResult>

  // Chunked upload (for large files)
  async chunkedUpload(body: StreamingBlobPayloadInputTypes, relativePath: string, options: UploadOptions, disk?: string): Promise<UploadResult>

  // List available storage disks
  getAvailableDisks(): string[]
}
```

### Storage Tokens

```typescript
import { STORAGE_TOKENS } from 'stratal/storage'

STORAGE_TOKENS.Options         // Symbol('StorageModuleOptions')
STORAGE_TOKENS.StorageService  // Symbol('StorageService')
STORAGE_TOKENS.StorageManager  // Symbol('StorageManager')
```

### Required Dependencies

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner
```

## I18n Module

### I18nModule Setup

```typescript
import { I18nModule } from 'stratal/i18n'

I18nModule.forRoot({
  defaultLocale: 'en',
  fallbackLocale: 'en',
  locales: ['en', 'fr', 'de'],
  messages: {
    en: {
      common: { welcome: 'Welcome, {name}!' },
      errors: { not_found: '{resource} not found' },
    },
    fr: {
      common: { welcome: 'Bienvenue, {name} !' },
      errors: { not_found: '{resource} introuvable' },
    },
  },
})
```

### I18nModuleOptions

```typescript
interface I18nModuleOptions {
  defaultLocale?: string                                  // Default: 'en'
  fallbackLocale?: string                                 // Fallback if translation missing
  locales?: string[]                                      // Supported locale codes
  messages?: Record<string, Record<string, unknown>>      // Translation messages
}
```

### I18nService API

```typescript
import { I18N_TOKENS } from 'stratal/i18n'

@Transient()
export class WelcomeService {
  constructor(
    @inject(I18N_TOKENS.I18nService) private readonly i18n: I18nService,
  ) {}

  getWelcomeMessage(name: string): string {
    return this.i18n.t('common.welcome', { name })  // "Welcome, Alice!"
  }

  getCurrentLocale(): string {
    return this.i18n.getLocale()  // "en"
  }
}
```

The I18nService resolves the locale from the `X-Locale` request header automatically when used in request scope.

### I18n Tokens

```typescript
import { I18N_TOKENS } from 'stratal/i18n'

I18N_TOKENS.I18nService    // Symbol('I18nModule.I18nService')
I18N_TOKENS.MessageLoader  // Symbol('I18nModule.MessageLoader')
I18N_TOKENS.Options        // Symbol('I18nModule.Options')
```

### Validation Messages

Import Zod from `stratal/validation` to get automatic i18n support for validation error messages. Zod validation errors are translated using the current request locale.

Use `withI18n` to provide a custom i18n key that overrides the auto-translated default for a specific field:

```typescript
import { z, withI18n } from 'stratal/validation'

const fileExistsInput = z.object({
  path: z.string().min(1, withI18n('errors.files.pathRequired')),
})
```

`withI18n` returns a structure that the framework's validation layer resolves to a translated string at request time using the current locale. Use it when you need a custom, app-specific message instead of the default auto-translated Zod error.
