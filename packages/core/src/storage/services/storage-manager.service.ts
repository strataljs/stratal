import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import { DiskNotConfiguredError, StorageProviderNotSupportedError } from '../errors'
import { S3StorageProvider } from '../providers/s3-storage.provider'
import type { IStorageProvider } from '../providers/storage-provider.interface'
import { STORAGE_TOKENS } from '../storage.tokens'
import type { StorageConfig, StorageEntry } from '../types'

/**
 * Storage Manager Service
 * Manages multiple storage providers (one per disk)
 * Handles lazy initialization and caching of S3Clients
 */
@Transient(STORAGE_TOKENS.StorageManager)
export class StorageManagerService {
  private readonly providers = new Map<string, IStorageProvider>()
  private readonly diskConfigs = new Map<string, StorageEntry>()

  constructor(
    @inject(STORAGE_TOKENS.Options)
    private readonly options: StorageConfig
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
  getProvider(diskName: string): IStorageProvider {
    // Return cached provider if exists
    const cached = this.providers.get(diskName)
    if (cached) {
      return cached
    }

    // Get disk configuration
    const diskConfig = this.diskConfigs.get(diskName)
    if (!diskConfig) {
      throw new DiskNotConfiguredError(diskName)
    }

    // Create provider based on configuration
    const provider = this.createProvider(diskConfig)

    // Cache provider
    this.providers.set(diskName, provider)

    return provider
  }

  /**
   * Create a provider instance based on configuration
   * @param config - Storage entry configuration
   * @returns Storage provider instance
   */
  private createProvider(config: StorageEntry): IStorageProvider {
    switch (config.provider) {
      case 's3':
        return new S3StorageProvider(config)
      case 'gcs':
        throw new StorageProviderNotSupportedError(config.provider)
      default:
        throw new StorageProviderNotSupportedError(config.provider)
    }
  }

  /**
   * Get disk configuration
   * @param diskName - Name of the disk
   * @returns Storage entry configuration
   */
  getDiskConfig(diskName: string): StorageEntry {
    const config = this.diskConfigs.get(diskName)
    if (!config) {
      throw new DiskNotConfiguredError(diskName)
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
