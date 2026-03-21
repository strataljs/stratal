---
"stratal": patch
---

Lazy-load S3 storage provider and enhance StorageManagerService with promise deduplication

### Details

- `StorageManager.getProvider()` is now async and dynamically imports `S3StorageProvider` to avoid loading AWS SDK at module evaluation time
- Add promise deduplication to prevent concurrent `getProvider` calls from creating multiple provider instances
- Register `StorageManager` as a singleton to share cached providers across requests
- Move `reflect-metadata` from hard dependency to optional peer dependency
- Remove `@tus/server` peer dependency
- Remove direct exports of `S3StorageProvider` and S3 multipart types from the storage barrel — use dynamic import instead
