/**
 * Storage Module
 * Provides file storage capabilities using Cloudflare R2
 * Supports multiple disk configurations with dynamic path templates
 */

import { Scope } from '../di/types'
import { Module } from '../module'
import type { AsyncModuleOptions, DynamicModule } from '../module/types'
import { StorageManagerService } from './services/storage-manager.service'
import { StorageService } from './services/storage.service'
import { STORAGE_TOKENS } from './storage.tokens'
import type { StorageConfig } from './types'

/**
 * Storage module options
 * Same as StorageConfig from types.ts
 */
export type StorageModuleOptions = StorageConfig

@Module({
  providers: [
    { provide: STORAGE_TOKENS.StorageManager, useClass: StorageManagerService, scope: Scope.Singleton },
    { provide: STORAGE_TOKENS.StorageService, useClass: StorageService },
  ],
})
export class StorageModule {
  /**
   * Configure StorageModule with static options
   *
   * @example
   * ```typescript
   * StorageModule.forRoot({
   *   storage: [{ disk: 'uploads', binding: 'MY_BUCKET', root: 'uploads' }],
   *   defaultStorageDisk: 'uploads',
   *   presignedUrl: { defaultExpiry: 3600, maxExpiry: 86400 }
   * })
   * ```
   */
  static forRoot(options: StorageModuleOptions): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        { provide: STORAGE_TOKENS.Options, useValue: options },
      ],
    }
  }

  /**
   * Configure StorageModule with async factory
   *
   * Use when configuration depends on other services.
   *
   * @example
   * ```typescript
   * StorageModule.forRootAsync({
   *   inject: [storageConfig.KEY],
   *   useFactory: (storage) => ({
   *     storage: storage.storage,
   *     defaultStorageDisk: storage.defaultStorageDisk,
   *     presignedUrl: storage.presignedUrl
   *   })
   * })
   * ```
   */
  static forRootAsync(options: AsyncModuleOptions<StorageModuleOptions>): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        {
          provide: STORAGE_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    }
  }
}
