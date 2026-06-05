/**
 * Storage entry configuration
 * Represents a single storage disk backed by Cloudflare R2
 */
export interface StorageEntry {
	disk: string
	/** R2Bucket binding name from wrangler.toml */
	binding: string
	root: string
}

/**
 * Presigned URL configuration
 */
export interface PresignedUrlConfig {
	defaultExpiry: number
	maxExpiry: number
}

/**
 * Storage route configuration
 */
export interface StorageRouteConfig {
	/** Base path for storage routes. Default: '/storage' */
	basePath?: string
	/** Disable auto-registered storage routes. Default: false */
	disabled?: boolean
}

/**
 * Storage configuration used by framework
 */
export interface StorageConfig {
	storage: StorageEntry[]
	defaultStorageDisk: string
	presignedUrl: PresignedUrlConfig
	/** Config for auto-registered storage routes (presigned URL proxying) */
	route?: StorageRouteConfig
}
