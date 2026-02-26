# Storage Module

The Storage Module provides file storage capabilities using S3-compatible storage (AWS S3, Cloudflare R2, MinIO, etc.). It supports multi-disk configuration with dynamic path templates, presigned URLs, and independent credentials per disk.

## Features

- **Multi-Disk Configuration**: Support for multiple storage disks (public, private) with independent credentials
- **Dynamic Path Templates**: Path templates with variables like `{date}`, `{year}`, `{month}`
- **Presigned URLs**: Generate temporary signed URLs for secure file access (GET, PUT, DELETE, HEAD operations)
- **Provider Abstraction**: Extensible provider interface supporting multiple storage backends
- **Request-Scoped**: Proper isolation via request-scoped DI
- **Type-Safe**: Full TypeScript support with Zod validation
- **i18n Error Messages**: Localized error messages in English and Swahili

## Architecture

The module follows a layered architecture:

1. **StorageService** (Request-scoped): Main facade providing high-level storage operations
2. **StorageManagerService** (Singleton): Manages multiple storage providers, one per disk, with lazy initialization
3. **Provider Layer**: Abstract interface with S3 implementation using AWS SDK
4. **Configuration**: Static disk configuration via ConfigService from environment variables

### Why Request-Scoped?

StorageService is request-scoped because it depends on:
- **I18nService**: Used by error classes for localized messages

StorageManagerService remains a singleton since it has no request dependencies and manages provider instances across requests.

## Configuration

Configure storage disks in your `.dev.vars` or production secrets:

```bash
# Multi-disk storage configuration
STORAGE__DEFAULT_STORAGE_DISK="private"
STORAGE__STORAGE='[
  {
    "disk": "public",
    "provider": "s3",
    "endpoint": "https://your-account-id.r2.cloudflarestorage.com",
    "bucket": "my-app-public",
    "region": "auto",
    "accessKeyId": "your-access-key-id",
    "secretAccessKey": "your-secret-access-key",
    "root": "public",
    "visibility": "public"
  },
  {
    "disk": "private",
    "provider": "s3",
    "endpoint": "https://your-account-id.r2.cloudflarestorage.com",
    "bucket": "my-app-private",
    "region": "auto",
    "accessKeyId": "your-access-key-id",
    "secretAccessKey": "your-secret-access-key",
    "root": "private",
    "visibility": "private"
  }
]'

# Presigned URL configuration
STORAGE__PRESIGNED_URL__DEFAULT_EXPIRY="3600"
STORAGE__PRESIGNED_URL__MAX_EXPIRY="604800"
```

### Configuration Schema

Each storage entry supports:

- **disk**: Unique identifier for the disk (e.g., "public", "private")
- **provider**: Storage provider type ("s3" or "gcs")
- **endpoint**: S3-compatible endpoint URL (e.g., `https://account-id.r2.cloudflarestorage.com` for R2, `https://s3.us-east-1.amazonaws.com` for AWS)
- **bucket**: S3 bucket name
- **region**: AWS region or "auto" for R2
- **accessKeyId**: S3 access key ID
- **secretAccessKey**: S3 secret access key
- **root**: Root path prefix with optional template variables
- **visibility**: "public" or "private" (controls default ACL)

### Presigned URL Limits

- **Minimum expiry**: 1 second
- **Maximum expiry**: 604,800 seconds (7 days) - R2 limitation
- **Default expiry**: 3,600 seconds (1 hour)

## Usage

### Basic Operations

Inject `StorageService` via dependency injection:

```typescript
import { inject } from 'tsyringe'
import { Transient, STORAGE_TOKENS, type StorageService } from 'stratal'

// Service class (registered with scope: Scope.Request)
@Transient(MY_TOKENS.DocumentService)
export class DocumentService {
  constructor(
    @inject(STORAGE_TOKENS.StorageService)
    private readonly storage: StorageService
  ) {}

  async uploadDocument(file: File): Promise<void> {
    // Upload to default disk
    await this.storage.upload(file, 'documents/resume.pdf')

    // Upload to specific disk
    await this.storage.upload(file, 'avatars/user.jpg', 'public')
  }
}
```

### Presigned URLs

Generate temporary signed URLs for client-side uploads/downloads:

```typescript
// Generate upload URL (valid for 1 hour)
const { url, expiresAt } = await this.storage.getPresignedUploadUrl(
  'documents/application.pdf',
  3600, // expires in 1 hour
  'private'
)

// Generate download URL with default expiry
const { url } = await this.storage.getPresignedDownloadUrl(
  'documents/resume.pdf'
)

// Generate delete URL
const { url } = await this.storage.getPresignedDeleteUrl(
  'documents/old-file.pdf'
)
```

**Note**: Presigned URLs use standard S3 behavior - they are reusable until expiration. There is no built-in mechanism to prevent multiple uses before expiry.

## Path Templates

The `root` configuration supports dynamic variables that are substituted at runtime:

- **{date}**: Current date in ISO format (YYYY-MM-DD)
- **{year}**: Current year (YYYY)
- **{month}**: Current month with leading zero (MM)

### Examples

```
# Date-based organization
root: "uploads/{year}/{month}"
→ "uploads/2025/11/document.pdf"

# Combined templates
root: "uploads/{year}/{month}/{date}"
→ "uploads/2025/11/2025-11-04/document.pdf"
```

## Error Handling

All errors extend `ApplicationError` with localized i18n keys under `errors.storage.*`:

- **FileNotFoundError**: File does not exist (`errors.storage.fileNotFound`)
- **InvalidDiskError**: Specified disk not found (`errors.storage.invalidDisk`)
- **DiskNotConfiguredError**: Disk configuration missing (`errors.storage.diskNotConfigured`)
- **StorageProviderNotSupportedError**: Provider not implemented (`errors.storage.providerNotSupported`)
- **PresignedUrlInvalidExpiryError**: Expiry outside 1s-7d range (`errors.storage.presignedUrlInvalidExpiry`)
- **InvalidFileTypeError**: File type not allowed (`errors.storage.invalidFileType`)
- **FileTooLargeError**: File exceeds size limit (`errors.storage.fileTooLarge`)

All errors include contextual data (file path, disk name, etc.) and are automatically translated based on request locale.

## Dependency Injection

The module registers two services:

- **StorageManagerService**: Singleton managing provider instances
- **StorageService**: Request-scoped for proper isolation

Registration happens automatically in `application.ts` as a core module (alongside ConfigModule, I18nModule, EmailModule).

## Available Disks

Query available disk configurations:

```typescript
const disks = this.storage.getAvailableDisks()
// Returns: ['public', 'private']
```

## Best Practices

1. **Use Path Templates**: Leverage `{date}`, `{year}`, `{month}` for dynamic path organization
2. **Minimal Disk Switching**: Design file organization to minimize explicit disk parameter usage
3. **Presigned URLs for Clients**: Generate presigned URLs for direct client uploads/downloads to avoid proxying large files through your API
4. **Expiry Times**: Use shortest practical expiry times for presigned URLs (default 1 hour is reasonable)
5. **Error Handling**: Always catch storage errors and handle gracefully (file might not exist, network issues, etc.)
6. **Environment Separation**: Use separate buckets/disks for development, staging, and production
7. **Independent Credentials**: Each disk should have its own access credentials with minimal required permissions

## Environment Setup

### Development

See `.dev.vars.example` for local configuration structure. Update with your S3-compatible storage credentials.

### Production

Set environment variables in Cloudflare Workers dashboard:

1. Navigate to Workers & Pages → Your Worker → Settings → Variables
2. Add `STORAGE__DEFAULT_STORAGE_DISK` as plain text variable
3. Add `STORAGE__STORAGE` as encrypted secret (JSON array)
4. Add presigned URL configuration variables
5. Deploy updated configuration

### Creating R2 Buckets

```bash
# Using Wrangler CLI
wrangler r2 bucket create my-app-public
wrangler r2 bucket create my-app-private
wrangler r2 bucket create my-app-uploads

# Generate API tokens in Cloudflare Dashboard:
# R2 → Manage R2 API Tokens → Create API Token
# Permissions: Object Read & Write for each bucket
```

## API Reference

### StorageService Methods

- `upload(file: File, relativePath: string, disk?: string): Promise<UploadResult>`
- `download(relativePath: string, disk?: string): Promise<DownloadResult>`
- `delete(relativePath: string, disk?: string): Promise<void>`
- `exists(relativePath: string, disk?: string): Promise<boolean>`
- `getPresignedDownloadUrl(relativePath: string, expiresIn?: number, disk?: string): Promise<PresignedUrlResult>`
- `getPresignedUploadUrl(relativePath: string, expiresIn?: number, disk?: string): Promise<PresignedUrlResult>`
- `getPresignedDeleteUrl(relativePath: string, expiresIn?: number, disk?: string): Promise<PresignedUrlResult>`
- `getAvailableDisks(): string[]`

### Type Definitions

See source files for current type definitions:

- [UploadResult](./contracts/upload-file.input.ts) - Upload operation result (path, disk, size, mimeType, etc.)
- [DownloadResult](./contracts/download-result.ts) - Download operation result with lazy stream/string/buffer access
- [PresignedUrlResult](./contracts/presigned-url-result.ts) - Presigned URL with expiration info

## Extending the Module

### Adding New Providers

1. Implement `IStorageProvider` interface
2. Add provider to `StorageManagerService.createProvider()` switch case
3. Update `StorageEntrySchema` enum with new provider name
4. Add provider-specific configuration fields if needed

Currently supported: S3-compatible storage (AWS S3, Cloudflare R2, MinIO, etc.)
Future providers: Google Cloud Storage (GCS)

## Related Documentation

- [Module System Architecture](../../../docs/architecture.md)
- [Config Service](../config/README.md)
- [Error Handling Patterns](../../../../docs/error-codes.md)
- [Request Scoping](../../../docs/request-scoping.md)
- [Email Module](../email/README.md) (similar request-scoped pattern)
