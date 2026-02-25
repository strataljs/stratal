import { Transient } from '../../di/decorators'
import { CONFIG_TOKENS } from '../config.tokens'
import type { ConfigPath, ConfigPathValue, IConfigService, ModuleConfig } from '../config.types'
import { ConfigNotInitializedError } from '../errors'

/**
 * ConfigService with dot notation support for get/set operations
 *
 * Supports runtime overrides via set() - useful for tenant-specific config.
 * Use reset() to restore original values.
 *
 * @example
 * ```typescript
 * // Get with dot notation
 * const url = config.get('database.url')
 * const fromName = config.get('email.from.name')
 *
 * // Set at runtime (e.g., in middleware for tenant override)
 * config.set('email.from.name', tenant.schoolName)
 *
 * // Reset to original
 * config.reset('email.from.name') // reset specific path
 * config.reset() // reset entire config
 * ```
 */
@Transient(CONFIG_TOKENS.ConfigService)
export class ConfigService<T extends object = ModuleConfig> implements IConfigService<T> {
  private originalConfig: T | undefined
  private currentConfig: T | undefined

  /**
   * Initialize the config service with validated configuration
   * Called by ConfigModule during initialization
   */
  initialize(config: T): void {
    this.originalConfig = this.deepClone(config)
    this.currentConfig = this.deepClone(config)
  }

  /**
   * Get config value using dot notation
   * @example config.get('database.url')
   */
  get<P extends ConfigPath<T>>(path: P): ConfigPathValue<T, P> {
    this.ensureInitialized()
    return this.getByPath(this.currentConfig, path) as ConfigPathValue<T, P>
  }

  /**
   * Set config value at runtime (for tenant overrides)
   * @example config.set('email.from.name', 'School Name')
   */
  set<P extends ConfigPath<T>>(path: P, value: ConfigPathValue<T, P>): void {
    this.ensureInitialized()
    this.setByPath(this.currentConfig, path, value)
  }

  /**
   * Reset config to original value
   * @param path - Optional path to reset (resets entire config if omitted)
   */
  reset(path?: ConfigPath<T>): void {
    this.ensureInitialized()
    if (path) {
      const originalValue = this.getByPath(this.originalConfig, path)
      this.setByPath(this.currentConfig, path, this.deepClone(originalValue))
    } else {
      this.currentConfig = this.deepClone(this.originalConfig)
    }
  }

  /**
   * Get entire config object
   */
  all(): Readonly<T> {
    this.ensureInitialized()
    return this.currentConfig as Readonly<T>
  }

  /**
   * Check if a config path exists
   */
  has(path: ConfigPath<T>): boolean {
    this.ensureInitialized()
    return this.getByPath(this.currentConfig, path) !== undefined
  }

  private getByPath(obj: unknown, path: string): unknown {
    const keys = path.split('.')
    let current = obj
    for (const key of keys) {
      if (current === null || current === undefined) return undefined
      current = (current as Record<string, unknown>)[key]
    }
    return current
  }

  private setByPath(obj: unknown, path: string, value: unknown): void {
    const keys = path.split('.')
    let current = obj as Record<string, unknown>
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {}
      }
      current = current[key] as Record<string, unknown>
    }
    current[keys[keys.length - 1]] = value
  }

  private ensureInitialized(): void {
    if (!this.currentConfig) {
      throw new ConfigNotInitializedError()
    }
  }

  private deepClone<V>(obj: V): V {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    return JSON.parse(JSON.stringify(obj)) as V
  }
}
