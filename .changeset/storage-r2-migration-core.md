---
"stratal": patch
---

Migrate storage from AWS S3 to Cloudflare R2 for all storage operations

### Breaking Changes

- The `S3StorageProvider` has been removed. All storage operations now use the native Cloudflare R2 API via `R2StorageProvider`.
- Storage configuration no longer requires AWS credentials or S3 endpoint settings. Instead, configure an R2 bucket binding in your `wrangler.toml` and reference it in your storage config.
- Presigned URLs now require the `APP_SECRET` environment variable instead of AWS credentials.
- The `StorageProviderNotSupportedError` has been replaced with `R2BindingNotFoundError` and `R2PresignedUrlSecretMissingError`.

### Migration

1. Replace any `S3StorageProvider` references with `R2StorageProvider`.
2. Update your `wrangler.toml` to bind your R2 bucket.
3. Set `APP_SECRET` in your environment for presigned URL support.
4. Remove AWS SDK credentials from your environment.
