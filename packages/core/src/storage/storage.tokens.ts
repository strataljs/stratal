/**
 * Dependency injection tokens for the Storage module
 * Using Symbol-based tokens to avoid magic strings
 */
export const STORAGE_TOKENS = {
  Options: Symbol.for('StorageModuleOptions'),
  StorageService: Symbol.for('StorageService'),
  StorageManager: Symbol.for('StorageManager'),
} as const
