/**
 * Storage Module
 * Provides file storage capabilities using AWS S3/Cloudflare R2
 */

// Module
export { StorageModule } from './storage.module'

// Tokens
export { STORAGE_TOKENS } from './storage.tokens'

// Services
export { StorageManagerService } from './services/storage-manager.service'
export { StorageService } from './services/storage.service'

// Contracts
export * from './contracts'

// Types
export type { PresignedUrlConfig, StorageConfig, StorageEntry } from './types'

// Errors
export * from './errors'

// Provider interfaces (for advanced usage)
export type {
  CompletedPart,
  CompleteMultipartResult, CreateMultipartOptions,
  CreateMultipartResult, DeleteObjectsResult, HeadObjectResult, IS3MultipartProvider, ListMultipartUploadsResult, ListPartsResult,
  MultipartUploadInfo, PartInfo, UploadPartResult
} from './providers/s3-multipart-provider.interface'
export type { IStorageProvider, StreamingBlobPayloadInputTypes } from './providers/storage-provider.interface'

// Provider implementations (for direct instantiation)
export { S3StorageProvider } from './providers/s3-storage.provider'
