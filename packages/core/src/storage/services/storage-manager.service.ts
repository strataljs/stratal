import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import { type StratalEnv } from '../../env'
import { StorageError } from '../storage.error'
import type { IStorageProvider } from '../providers/storage-provider.interface'
import { STORAGE_TOKENS } from '../storage.tokens'
import type { StorageConfig, StorageEntry } from '../types'

/**
 * Storage Manager Service
 * Manages multiple storage providers (one per disk)
 * Handles lazy initialization and caching of R2 providers
 */
@Singleton(STORAGE_TOKENS.StorageManager)
export class StorageManagerService {
  private readonly providers = new Map<string, IStorageProvider>()
  private readonly creationPromises = new Map<string, Promise<IStorageProvider>>()
  private readonly diskConfigs = new Map<string, StorageEntry>()

  constructor(
    @inject(STORAGE_TOKENS.Options)
    private readonly options: StorageConfig,
    @inject(DI_TOKENS.CloudflareEnv)
    private readonly env: StratalEnv
  ) {
    this.initializeDiskConfigs()
  }

  /**
   * Initialize disk configurations from options
   */
  private initializeDiskConfigs(): void {
    for (const entry of this.options.storage) {
      this.diskConfigs.set(entry.disk, entry)
    }
  }

  /**
   * Get provider for a specific disk
   * Lazily initializes provider on first access
   * @param diskName - Name of the disk
   * @returns Storage provider instance
   */
  async getProvider(diskName: string): Promise<IStorageProvider> {
    // Return cached provider if exists
    const cached = this.providers.get(diskName)
    if (cached) {
      return cached
    }

    // Return in-flight creation promise to deduplicate concurrent calls
    const inflight = this.creationPromises.get(diskName)
    if (inflight) {
      return inflight
    }

    // Get disk configuration
    const diskConfig = this.diskConfigs.get(diskName)
    if (!diskConfig) {
      throw new StorageError(`Disk "${diskName}" is not configured`)
    }

    // Create provider and deduplicate concurrent calls
    const promise = this.createProvider(diskConfig).then((provider) => {
      this.providers.set(diskName, provider)
      this.creationPromises.delete(diskName)
      return provider
    }).catch((error: unknown) => {
      this.creationPromises.delete(diskName)
      throw error
    })

    this.creationPromises.set(diskName, promise)

    return promise
  }

  /**
   * Create an R2 provider instance
   * Dynamically imports R2StorageProvider to support code splitting
   * @param config - Storage entry configuration
   * @returns Storage provider instance
   */
  private async createProvider(config: StorageEntry): Promise<IStorageProvider> {
    const { R2StorageProvider } = await import('../providers/r2-storage.provider')
    const bucket = this.env[config.binding as keyof StratalEnv] as unknown as R2Bucket | undefined
    if (!bucket) {
      throw new StorageError(`R2 binding "${config.binding}" was not found in the environment`)
    }
    return new R2StorageProvider(config, bucket, this.env, this.options.route)
  }

  /**
   * Get disk configuration
   * @param diskName - Name of the disk
   * @returns Storage entry configuration
   */
  getDiskConfig(diskName: string): StorageEntry {
    const config = this.diskConfigs.get(diskName)
    if (!config) {
      throw new StorageError(`Disk "${diskName}" is not configured`)
    }
    return config
  }

  /**
   * Check if a disk exists
   * @param diskName - Name of the disk
   * @returns True if disk exists, false otherwise
   */
  hasDisk(diskName: string): boolean {
    return this.diskConfigs.has(diskName)
  }

  /**
   * Get all available disk names
   * @returns Array of disk names
   */
  getAvailableDisks(): string[] {
    return Array.from(this.diskConfigs.keys())
  }
}
