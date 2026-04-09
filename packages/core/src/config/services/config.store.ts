import { Transient } from '../../di/decorators'
import { CONFIG_TOKENS } from '../config.tokens'
import type { ConfigPath, ConfigPathValue, ModuleConfig } from '../config.types'
import { ConfigNotInitializedError } from '../errors'

/**
 * ConfigStore
 *
 * Singleton-scoped holder of validated, merged configuration.
 *
 * ConfigStore is the source of truth for configuration values. It is
 * initialized once during application startup by {@link ConfigModule}
 * and never mutated afterwards.
 *
 * Per-request overrides live on {@link ConfigService}, which reads
 * through to this store for any key not explicitly overridden.
 */
@Transient(CONFIG_TOKENS.ConfigStore)
export class ConfigStore<T extends object = ModuleConfig> {
  private data: T | undefined

  /**
   * Initialize the store with validated configuration.
   * Called by {@link ConfigModule} during initialization.
   */
  initialize(config: T): void {
    this.data = this.deepClone(config)
  }

  /**
   * Get config value using dot notation.
   */
  get<P extends ConfigPath<T>>(path: P): ConfigPathValue<T, P> {
    this.ensureInitialized()
    return this.getByPath(this.data, path) as ConfigPathValue<T, P>
  }

  /**
   * Check if a config path exists.
   */
  has(path: ConfigPath<T>): boolean {
    this.ensureInitialized()
    return this.getByPath(this.data, path) !== undefined
  }

  /**
   * Get the entire config object (readonly snapshot).
   */
  all(): Readonly<T> {
    this.ensureInitialized()
    return this.data as Readonly<T>
  }

  /**
   * True once {@link initialize} has been called.
   */
  isInitialized(): boolean {
    return this.data !== undefined
  }

  private getByPath(obj: unknown, path: string): unknown {
    const keys = path.split('.')
    let current = obj
    for (const key of keys) {
      if (this.isDangerousKey(key)) return undefined
      if (current === null || current === undefined) return undefined
      current = (current as Record<string, unknown>)[key]
    }
    return current
  }

  private isDangerousKey(key: string): boolean {
    return key === '__proto__' || key === 'constructor' || key === 'prototype'
  }

  private ensureInitialized(): void {
    if (this.data === undefined) {
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
