import type { z } from '../i18n/validation'

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodError
  ) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

/**
 * Configuration that can be augmented by applications
 * Apps should augment this interface with their AppConfig type using module augmentation
 *
 * @example
 * ```typescript
 * // In your app (e.g., apps/backend/src/config/types.ts)
 * declare module 'stratal' {
 *   interface ModuleConfig {
 *     database: { url: string; maxConnections: number }
 *     email: { provider: string; from: { name: string; email: string } }
 *   }
 * }
 * ```
 */
export interface ModuleConfig { }

/**
 * Generate all valid dot-notation paths from a config object type
 * @example ConfigPath<{ database: { url: string } }> = 'database' | 'database.url'
 */
export type ConfigPath<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
  ? K | `${K}.${ConfigPath<T[K]>}`
  : K
}[keyof T & string]

/**
 * Get the value type at a dot-notation path
 * @example ConfigPathValue<{ database: { url: string } }, 'database.url'> = string
 */
export type ConfigPathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
  ? T[K] extends Record<string, unknown>
  ? ConfigPathValue<T[K], Rest>
  : never
  : never
  : P extends keyof T
  ? T[P]
  : never

/**
 * ConfigService interface with dot notation support
 */
export interface IConfigService<T extends object = ModuleConfig> {
  /**
   * Initialize the config service with validated configuration
   * Should be called once during application startup
   */
  initialize(config: T): void

  /**
   * Get config value using dot notation
   * @example config.get('database.url')
   */
  get<P extends ConfigPath<T>>(path: P): ConfigPathValue<T, P>

  /**
   * Set config value at runtime (for tenant overrides)
   * @example config.set('email.from.name', 'School Name')
   */
  set<P extends ConfigPath<T>>(path: P, value: ConfigPathValue<T, P>): void

  /**
   * Reset config to original value
   * @param path - Optional path to reset (resets entire config if omitted)
   */
  reset(path?: ConfigPath<T>): void

  /**
   * Get entire config object
   */
  all(): Readonly<T>

  /**
   * Check if a config path exists
   */
  has(path: ConfigPath<T>): boolean
}
