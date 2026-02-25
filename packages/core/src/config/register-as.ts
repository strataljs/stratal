import type { InjectionToken } from 'tsyringe'
import { DI_TOKENS } from '../di/tokens'
import type { FactoryProvider } from '../module/types'

/**
 * Configuration namespace registration result
 */
export interface ConfigNamespace<TKey extends string, TEnv, TConfig extends object> {
  /** Auto-derived injection token (e.g., 'database' -> Symbol('CONFIG:database')) */
  readonly KEY: InjectionToken<TConfig>
  /** The namespace key */
  readonly namespace: TKey
  /** The factory function that receives env and returns config */
  readonly factory: (env: TEnv) => TConfig
  /**
   * Returns a provider configuration for use in module registration
   * Automatically injects DI_TOKENS.CloudflareEnv
   */
  asProvider(): FactoryProvider<TConfig>
}

/**
 * Create a namespaced configuration factory
 * Similar to NestJS registerAs
 *
 * @param namespace - Configuration namespace (e.g., 'database', 'email')
 * @param factory - Factory function receiving env and returning config object
 * @returns ConfigNamespace with token, factory, and asProvider() method
 *
 * @example
 * ```typescript
 * // apps/backend/src/config/database.config.ts
 * export const databaseConfig = registerAs('database', (env: Env) => ({
 *   url: env.DATABASE_URL,
 *   maxConnections: parseInt(env.DATABASE_MAX_CONNECTIONS || '10'),
 * }))
 *
 * // Auto-generates: databaseConfig.KEY = Symbol('CONFIG:database')
 *
 * // Usage in module:
 * // Option 1: Manual provider
 * {
 *   provide: databaseConfig.KEY,
 *   useFactory: databaseConfig.factory,
 *   inject: [DI_TOKENS.CloudflareEnv]
 * }
 *
 * // Option 2: asProvider() helper
 * databaseConfig.asProvider()
 * // Returns: { provide: databaseConfig.KEY, useFactory: ..., inject: [DI_TOKENS.CloudflareEnv] }
 * ```
 */
export function registerAs<TKey extends string, TEnv, TConfig extends object>(
  namespace: TKey,
  factory: (env: TEnv) => TConfig
): ConfigNamespace<TKey, TEnv, TConfig> {
  const KEY = Symbol.for(`CONFIG:${namespace}`) as InjectionToken<TConfig>

  return {
    KEY,
    namespace,
    factory,
    asProvider(): FactoryProvider<TConfig> {
      return {
        provide: KEY,
        useFactory: factory,
        inject: [DI_TOKENS.CloudflareEnv],
      }
    },
  }
}

/**
 * Helper to derive config type from registerAs result
 *
 * @example
 * ```typescript
 * const databaseConfig = registerAs('database', (env) => ({ url: env.DATABASE_URL }))
 * type DatabaseConfig = InferConfigType<typeof databaseConfig>
 * // { url: string }
 * ```
 */
export type InferConfigType<T> = T extends ConfigNamespace<string, unknown, infer C> ? C : never
