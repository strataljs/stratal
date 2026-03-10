/**
 * Dependency injection tokens for the Storage module
 * Using Symbol-based tokens to avoid magic strings
 */
export const STORAGE_TOKENS = {
  Options: Symbol.for('stratal:storage:options'),
  StorageService: Symbol.for('stratal:storage:service'),
  StorageManager: Symbol.for('stratal:storage:manager'),
} as const
