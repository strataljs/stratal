/**
 * Storage Module
 * Provides file storage capabilities using Cloudflare R2
 */

// Module
export { StorageModule } from './storage.module'

// Tokens
export { STORAGE_TOKENS } from './storage.tokens'

// Services
export { StorageManagerService } from './services/storage-manager.service'
export { StorageService } from './services/storage.service'

// Controller
export { StorageController } from './controllers/storage.controller'

// Contracts
export * from './contracts'

// Types
export type { PresignedUrlConfig, StorageConfig, StorageEntry, StorageRouteConfig } from './types'

// Errors
export * from './errors'

// Provider interfaces (for advanced usage)
export type { IStorageProvider, StreamingBlobPayloadInputTypes } from './providers/storage-provider.interface'
