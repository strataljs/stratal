# Infrastructure Services

## Cache

Cache uses Cloudflare KV under the hood. Inject via `CACHE_TOKENS.CacheService`.

```typescript
import { CACHE_TOKENS } from 'stratal/cache'
import type { CacheService } from 'stratal/cache'
import { Transient, inject } from 'stratal/di'

@Transient()
export class ProductService {
  constructor(
    @inject(CACHE_TOKENS.CacheService) private cache: CacheService,
  ) {}

  async getProduct(id: string) {
    return this.cache.get(`product:${id}`, 'json')
  }

  async setProduct(id: string, data: object) {
    await this.cache.put(`product:${id}`, JSON.stringify(data), {
      expirationTtl: 3600,
    })
  }

  async removeProduct(id: string) {
    await this.cache.delete(`product:${id}`)
  }

  async listProducts(prefix?: string) {
    return this.cache.list({ prefix })
  }
}
```

### Cache API (KV-based)

```typescript
interface CacheService {
  get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<T>
  getWithMetadata<Metadata>(key: string, type?): Promise<KVNamespaceGetWithMetadataResult>
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVNamespacePutOptions): Promise<void>
  delete(key: string): Promise<void>
  list<Metadata>(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult<Metadata>>
  withBinding(kv: KVNamespace): CacheService   // Use a different KV binding
}
```

### Multiple KV Namespaces

Use `withBinding()` to switch KV namespaces:

```typescript
@Transient()
export class MultiCacheService {
  constructor(
    @inject(CACHE_TOKENS.CacheService) private cache: CacheService,
    @inject(DI_TOKENS.CloudflareEnv) private env: StratalEnv,
  ) {}

  getSessionCache(): CacheService {
    return this.cache.withBinding(this.env.SESSION_KV)
  }

  getProductCache(): CacheService {
    return this.cache.withBinding(this.env.PRODUCT_KV)
  }
}
```

Default binding reads from `env.CACHE`.

## Logger

```typescript
import { LOGGER_TOKENS } from 'stratal/logger'
import type { LoggerService, LogLevel } from 'stratal/logger'
import { Transient, inject } from 'stratal/di'

@Transient()
export class MyService {
  constructor(
    @inject(LOGGER_TOKENS.LoggerService) private logger: LoggerService,
  ) {}

  doSomething() {
    this.logger.debug('Debug message', { key: 'value' })
    this.logger.info('Info message')
    this.logger.warn('Warning message')
    this.logger.error('Error message', { error })
  }
}
```

Configure logging in the Stratal constructor:

```typescript
export default new Stratal({
  module: AppModule,
  logging: {
    level: LogLevel.INFO,    // DEBUG, INFO, WARN, ERROR
    formatter: 'json',       // 'json' or 'text'
  },
})
```

## Email

### EmailModule Setup

```typescript
import { EmailModule } from 'stratal/email'

@Module({
  imports: [
    EmailModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env) => ({
        provider: 'resend',              // 'resend' | 'smtp'
        from: { name: 'My App', email: 'noreply@example.com' },
        apiKey: env.RESEND_API_KEY,      // required for resend provider
        queue: 'NOTIFICATIONS_QUEUE',    // queue binding registered via QueueModule
      }),
    }),
    QueueModule.registerQueue('NOTIFICATIONS_QUEUE'),
  ],
})
export class AppModule {}
```

### Sending Email

```typescript
import { EMAIL_TOKENS } from 'stratal/email'
import type { EmailService } from 'stratal/email'
import { Transient, inject } from 'stratal/di'

@Transient()
export class NotificationService {
  constructor(
    @inject(EMAIL_TOKENS.EmailService) private email: EmailService,
  ) {}

  async sendWelcome(to: string) {
    await this.email.send({
      to,
      subject: 'Welcome!',
      html: '<h1>Welcome to our app</h1>',
    })
  }

  async sendWithReactTemplate(to: string, name: string) {
    await this.email.send({
      to,
      subject: 'Welcome!',
      template: <WelcomeEmail name={name} />,  // React email template
    })
  }
}
```

Email supports `html`, `text`, and `template` (React) props. Emails are dispatched via queue for async sending. Providers: Resend, SMTP (nodemailer). Both are optional peerDependencies.

## Storage

Native Cloudflare R2 storage with multi-disk support. No third-party SDK dependency.

### Setup

Configure `StorageModule` with one or more disks. Each `disk` is a logical name; `binding` matches an `r2_buckets` binding in `wrangler.jsonc`; `root` is the path prefix written into the bucket.

```typescript
import { Module } from 'stratal/module'
import { StorageModule } from 'stratal/storage'

@Module({
  imports: [
    StorageModule.forRoot({
      storage: [
        { disk: 'uploads', binding: 'UPLOADS_BUCKET', root: 'uploads' },
        { disk: 'avatars', binding: 'AVATAR_BUCKET',  root: 'avatars' },
      ],
      defaultStorageDisk: 'uploads',
      presignedUrl: { defaultExpiry: 3600, maxExpiry: 86400 },
    }),
  ],
})
export class AppModule {}
```

`APP_SECRET` env var is required for presigned URLs (added to `wrangler.jsonc` `[vars]`). Use `StorageModule.forRootAsync({ inject, useFactory })` when config depends on other services.

### Using StorageService

```typescript
import { STORAGE_TOKENS } from 'stratal/storage'
import type { StorageService } from 'stratal/storage'
import { Transient, inject } from 'stratal/di'

@Transient()
export class FileService {
  constructor(
    @inject(STORAGE_TOKENS.StorageService) private storage: StorageService,
  ) {}

  async uploadFile(path: string, data: ReadableStream, mimeType: string, size: number) {
    return this.storage.upload(data, path, { mimeType, size })
  }

  async uploadStream(path: string, data: ReadableStream, mimeType: string) {
    // Use chunkedUpload when the stream size is unknown — splits into R2 multipart parts.
    return this.storage.chunkedUpload(data, path, { mimeType })
  }

  async downloadFile(path: string) {
    return this.storage.download(path)
  }

  async getDownloadUrl(path: string) {
    return this.storage.getPresignedDownloadUrl(path, 3600)
  }

  async getUploadUrl(path: string) {
    return this.storage.getPresignedUploadUrl(path, 3600)
  }
}
```

Pass `disk` as the last argument to target a non-default disk: `this.storage.upload(data, path, options, 'avatars')`.

### Storage API

```typescript
interface StorageService {
  upload(body, path, options, disk?): Promise<UploadResult>
  chunkedUpload(body, path, options, disk?): Promise<UploadResult>  // streams without known size
  download(path, disk?): Promise<DownloadResult>
  delete(path, disk?): Promise<void>
  exists(path, disk?): Promise<boolean>
  getPresignedDownloadUrl(path, expiresIn?, disk?): Promise<PresignedUrlResult>
  getPresignedUploadUrl(path, expiresIn?, disk?): Promise<PresignedUrlResult>
  getPresignedDeleteUrl(path, expiresIn?, disk?): Promise<PresignedUrlResult>
  getAvailableDisks(): string[]
}
```

Path supports template variables: `{date}`, `{year}`, `{month}`.

### Auto-Registered Storage Routes

`StorageModule` mounts a hidden `StorageController` that proxies R2 operations behind signed URLs. The presigned-URL helpers above return URLs that point at these routes:

- `GET    /storage/:disk/*` — download (used by `getPresignedDownloadUrl`)
- `PUT    /storage/:disk/*` — upload (used by `getPresignedUploadUrl`)
- `DELETE /storage/:disk/*` — delete (used by `getPresignedDeleteUrl`)

Override the base path or opt out:

```typescript
StorageModule.forRoot({
  // ...
  route: { basePath: '/files', disabled: false },  // default basePath: '/storage'
})
```

Set `route: { disabled: true }` to skip auto-registration entirely (e.g. when fronting R2 with your own controller).

## OpenAPI

Routes automatically generate OpenAPI spec from `@Route()` and HTTP method decorator schemas.

### Configuration

```typescript
import { OpenAPIModule } from 'stratal/openapi'

@Module({
  imports: [
    OpenAPIModule.forRoot({
      info: { title: 'My API', version: '1.0.0', description: 'API docs' },
      jsonPath: '/api/openapi.json',    // default
      ui: { path: '/api/docs' },        // default, or `false` to disable
    }),
  ],
})
export class AppModule {}
```

### Default Endpoints

- `GET /api/openapi.json` — JSON spec
- `GET /api/docs` — Scalar API docs UI

### Security Schemes

Built-in: `'bearerAuth'` (Bearer token), `'basicAuth'` (Basic auth).

Custom schemes can be passed via `securitySchemes` option.

## I18n

See `references/errors-and-i18n.md` for I18nModule configuration, I18nService usage, and `withI18n()` for Zod validation messages.
