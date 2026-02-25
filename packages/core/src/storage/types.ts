/**
 * Storage entry configuration
 * Represents a single storage disk with its credentials
 */
export interface StorageEntry {
	disk: string
	provider: 's3' | 'gcs'
	endpoint: string
	bucket: string
	region: string
	accessKeyId: string
	secretAccessKey: string
	root: string
	visibility: 'public' | 'private'
}

/**
 * Presigned URL configuration
 */
export interface PresignedUrlConfig {
	defaultExpiry: number
	maxExpiry: number
}

/**
 * Storage configuration used by framework
 */
export interface StorageConfig {
	storage: StorageEntry[]
	defaultStorageDisk: string
	presignedUrl: PresignedUrlConfig
}
