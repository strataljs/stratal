# Config

## ConfigModule

```typescript
import { ConfigModule } from 'stratal/config'

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [databaseConfig, appConfig],        // Array of registerAs() results
      validateSchema: configValidationSchema,    // Optional Zod schema to validate merged config
    }),
  ],
})
export class AppModule {}
```

Only `forRoot` is available (no `forRootAsync`). The module merges all namespace configs on initialization.

## registerAs()

Creates a typed config namespace:

```typescript
import { registerAs } from 'stratal/config'

export const databaseConfig = registerAs('database', (env: StratalEnv) => ({
  url: env.DATABASE_URL,
  poolSize: Number(env.DB_POOL_SIZE ?? 5),
}))

export const appConfig = registerAs('app', (env: StratalEnv) => ({
  name: env.APP_NAME ?? 'My App',
  debug: env.DEBUG === 'true',
}))
```

Returns a `ConfigNamespace` with:
- `.KEY` — Symbol token (`Symbol.for('stratal:config:database')`) for DI injection
- `.namespace` — the namespace string
- `.factory` — the factory function
- `.asProvider()` — returns a `FactoryProvider` for use in module `providers`

## ConfigService (Dot-Notation)

```typescript
import { CONFIG_TOKENS } from 'stratal/config'
import type { ConfigService } from 'stratal/config'
import { Transient, inject } from 'stratal/di'

@Transient()
export class MyService {
  constructor(
    @inject(CONFIG_TOKENS.ConfigService) private config: ConfigService,
  ) {}

  doSomething() {
    // Type-safe dot-notation access
    const url = this.config.get('database.url')
    const debug = this.config.get('app.debug')
    const all = this.config.all()     // Full config object
    const has = this.config.has('database.url')
  }
}
```

### ConfigService API

```typescript
interface ConfigService<T extends object> {
  get<P extends ConfigPath<T>>(path: P): ConfigPathValue<T, P>
  set<P extends ConfigPath<T>>(path: P, value: ConfigPathValue<T, P>): void
  reset(path?: ConfigPath<T>): void
  all(): Readonly<T>
  has(path: ConfigPath<T>): boolean
}
```

## Injecting a Specific Namespace

Use the `.KEY` token from `registerAs()`:

```typescript
import { databaseConfig } from './config/database.config'
import type { InferConfigType } from 'stratal/config'

type DatabaseConfig = InferConfigType<typeof databaseConfig>

@Transient()
export class DatabaseSetupService {
  constructor(
    @inject(databaseConfig.KEY) private dbConfig: DatabaseConfig,
  ) {}

  getConnectionUrl() {
    return this.dbConfig.url
  }
}
```

## Using asProvider() in Modules

If you need to register a config namespace as a provider directly (without ConfigModule):

```typescript
@Module({
  providers: [databaseConfig.asProvider()],
})
export class DatabaseModule {}
```

## Wrangler: Workers Caching

Required only when the app uses `@Cacheable` / `@PurgesCache` from `stratal/response-cache`:

```jsonc
// wrangler.jsonc
{
  "compatibility_date": "2026-07-06",  // or later
  "cache": { "enabled": true }
}
```

Also requires Wrangler `>= 4.69.0`. Without this block, an app with cache decorators fails on its **first request** with `ResponseCacheConfigError`. Add it to every environment — a `@PurgesCache` route without the binding turns every successful mutation into a `500`. See `references/response-cache.md`.
