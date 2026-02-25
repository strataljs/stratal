# Cache Module

Type-safe wrapper around Cloudflare KV namespaces for caching operations.

## Features

- ✅ Mirrors all KVNamespace methods with full type safety
- ✅ Multiple KV binding support via `withBinding()`
- ✅ Automatic error handling with security-focused logging
- ✅ Singleton service for optimal performance
- ✅ i18n error messages (English & Swahili)

## Quick Start

```typescript
import { CACHE_TOKENS, CacheService } from 'stratal'
import { inject } from 'tsyringe'

class MyService {
  constructor(
    @inject(CACHE_TOKENS.CacheService)
    private readonly cache: CacheService
  ) {}

  async cacheUserData(userId: string, data: UserData) {
    // Store with 1 hour TTL
    await this.cache.put(`user:${userId}`, JSON.stringify(data), {
      expirationTtl: 3600
    })
  }

  async getUserData(userId: string): Promise<UserData | null> {
    return await this.cache.get<UserData>(`user:${userId}`, { type: 'json' })
  }
}
```

## Using Different KV Bindings

```typescript
// Get a cache instance for a different KV namespace
const uploadsCache = this.cache.withBinding(this.env.UPLOADS_CACHE)
await uploadsCache.put('upload:123', metadata)

const systemCache = this.cache.withBinding(this.env.SYSTEM_CONFIG_KV)
await systemCache.put('config:key', value)
```

## API

### `get(key, options?)`
Retrieve a value from cache with optional type conversion.

### `getWithMetadata(key, options?)`
Retrieve a value along with its metadata.

### `put(key, value, options?)`
Store a value in cache with optional TTL and metadata.

### `delete(key)`
Remove a value from cache.

### `list(options?)`
List keys in cache with optional filtering and pagination.

### `withBinding(kv: KVNamespace)`
Create a new CacheService instance using a different KV binding.

### `setKV(kv: KVNamespace)`
Change the KV binding for this instance.

## Error Handling

All operations wrap errors in specific error classes:
- `CacheGetError` - Failed to retrieve value
- `CachePutError` - Failed to store value
- `CacheDeleteError` - Failed to delete value
- `CacheListError` - Failed to list keys

**Security**: Raw errors are logged via LoggerService but NOT exposed to users.

## Documentation

See [docs/cache.md](../../../../../docs/cache.md) for comprehensive documentation.
