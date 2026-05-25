import { Transient } from '../../di/decorators'
import { CONFIG_TOKENS } from '../config.tokens'
import type { ConfigPath, ConfigPathValue, ModuleConfig } from '../config.types'
import { ConfigError } from '../config.error'

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
 *
 * If the store is never initialized (no `ConfigModule.forRoot()`), it
 * behaves like an empty config: `has()` returns `false`, `all()` returns
 * `{}`, and `get()` throws {@link ConfigError} for any path —
 * the same error you'd get for a missing key on an initialized store.
 * Resolving the store via DI never throws on its own.
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
   * Get config value using dot notation. Throws
   * {@link ConfigError} if the path is absent.
   */
  get<P extends ConfigPath<T>>(path: P): ConfigPathValue<T, P> {
    const value = this.getByPath(this.data ?? {}, path)
    if (value === undefined) {
      throw new ConfigError(`Configuration key "${path}" was not found`)
    }
    return value as ConfigPathValue<T, P>
  }

  /**
   * Check if a config path exists. Returns `false` when the store has
   * not been initialized.
   */
  has(path: ConfigPath<T>): boolean {
    return this.getByPath(this.data ?? {}, path) !== undefined
  }

  /**
   * Get the entire config object (readonly snapshot). Returns an empty
   * object when the store has not been initialized.
   */
  all(): Readonly<T> {
    return (this.data ?? ({} as T)) as Readonly<T>
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

  private deepClone<V>(obj: V): V {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    return JSON.parse(JSON.stringify(obj)) as V
  }
}
