---
"stratal": patch
---

Lazy-load S3 storage provider to avoid loading AWS SDK at module evaluation time

### Details

- `StorageManager.getProvider()` is now async and dynamically imports `S3StorageProvider`
- Moved `reflect-metadata` from hard dependency to optional peer dependency
- Removed `@tus/server` peer dependency
- Removed direct exports of `S3StorageProvider` and S3 multipart types from the storage barrel — use dynamic import instead
