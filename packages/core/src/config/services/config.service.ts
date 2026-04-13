import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import { Macroable } from '../../macroable/macroable'
import { CONFIG_TOKENS } from '../config.tokens'
import type { ConfigPath, ConfigPathValue, IConfigService, ModuleConfig } from '../config.types'
import { type ConfigStore } from './config.store'

/**
 * ConfigService with dot notation support and per-request overrides.
 *
 * ConfigService is **request-scoped**: each request gets its own
 * instance with a private `overrides` map layered over the shared
 * {@link ConfigStore}. Calls to {@link set} mutate only the current
 * request's overrides, which makes it safe to mutate config from
 * middleware (e.g. to pin `environment.appUrl` to the request host).
 *
 * Extends {@link Macroable} so apps can add domain-specific getters
 * and methods via `ConfigService.getter()` / `ConfigService.macro()`.
 *
 * @example
 * ```typescript
 * // Read with dot notation
 * const url = config.get('database.url')
 * const fromName = config.get('email.from.name')
 *
 * // Per-request override (e.g. in middleware)
 * config.set('environment.appUrl', `${proto}://${host}`)
 *
 * // Reset the override for the current request
 * config.reset('environment.appUrl')
 * ```
 */
@Transient(CONFIG_TOKENS.ConfigService)
export class ConfigService<T extends object = ModuleConfig> extends Macroable implements IConfigService<T> {
  private overrides = new Map<string, unknown>()

  constructor(
    @inject(CONFIG_TOKENS.ConfigStore) private readonly store: ConfigStore<T>,
  ) {
    super()
  }

  /**
   * Get config value using dot notation. Request overrides take
   * precedence over the shared store.
   */
  get<P extends ConfigPath<T>>(path: P): ConfigPathValue<T, P> {
    const override = this.readOverride(path)
    if (override !== undefined) {
      return override as ConfigPathValue<T, P>
    }
    return this.store.get(path)
  }

  /**
   * Set a config value for the lifetime of the current request.
   * Does not mutate the shared store.
   */
  set<P extends ConfigPath<T>>(path: P, value: ConfigPathValue<T, P>): void {
    if (this.hasDangerousSegment(path)) return
    this.overrides.set(path, value)
  }

  /**
   * Clear a single override, or all overrides for this request.
   */
  reset(path?: ConfigPath<T>): void {
    if (path) {
      this.overrides.delete(path)
      return
    }
    this.overrides.clear()
  }

  /**
   * Get the full config object, with request overrides merged in.
   */
  all(): Readonly<T> {
    const base = this.store.all() as T
    if (this.overrides.size === 0) {
      return base as Readonly<T>
    }
    const merged = this.deepClone(base)
    for (const [path, value] of this.overrides) {
      this.writeByPath(merged, path, value)
    }
    return merged as Readonly<T>
  }

  /**
   * Check if a config path exists (in overrides or the store).
   */
  has(path: ConfigPath<T>): boolean {
    if (this.readOverride(path) !== undefined) return true
    return this.store.has(path)
  }

  private readOverride(path: string): unknown {
    if (this.hasDangerousSegment(path)) return undefined
    if (this.overrides.has(path)) {
      return this.overrides.get(path)
    }
    // Support partial-path reads: if an ancestor was overridden, walk into it.
    const segments = path.split('.')
    for (let i = segments.length - 1; i > 0; i--) {
      const parent = segments.slice(0, i).join('.')
      if (this.overrides.has(parent)) {
        const parentValue = this.overrides.get(parent)
        return this.walk(parentValue, segments.slice(i))
      }
    }
    return undefined
  }

  private walk(value: unknown, keys: string[]): unknown {
    let current = value
    for (const key of keys) {
      if (current === null || current === undefined) return undefined
      current = (current as Record<string, unknown>)[key]
    }
    return current
  }

  private writeByPath(obj: unknown, path: string, value: unknown): void {
    const keys = path.split('.')
    if (keys.some((key) => this.isDangerousKey(key))) return
    let current = obj as Record<string, unknown>
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!Object.hasOwn(current, key) || typeof current[key] !== 'object' || current[key] === null) {
        Object.defineProperty(current, key, {
          value: {},
          writable: true,
          enumerable: true,
          configurable: true,
        })
      }
      current = current[key] as Record<string, unknown>
    }
    Object.defineProperty(current, keys[keys.length - 1], {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    })
  }

  private hasDangerousSegment(path: string): boolean {
    return path.split('.').some((key) => this.isDangerousKey(key))
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
