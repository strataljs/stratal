import type { SchemaDef } from '@zenstackhq/schema'

/**
 * Augmentable schema registry for strict DatabaseService typing.
 *
 * Users augment this interface to register their ZenStack schemas per connection:
 *
 * @example
 * ```typescript
 * declare module '@stratal/framework/database' {
 *   interface DatabaseSchemaRegistry {
 *     main: typeof mainSchema
 *     analytics: typeof analyticsSchema
 *   }
 * }
 * ```
 */
export interface DatabaseSchemaRegistry { }

/**
 * Augmentable interface to declare the default database connection.
 *
 * @example
 * ```typescript
 * declare module '@stratal/framework/database' {
 *   interface DefaultDatabaseConnection {
 *     name: 'main'
 *   }
 * }
 * ```
 */
export interface DefaultDatabaseConnection { }

/** Connection name with autocomplete when augmented, string fallback otherwise */
export type ConnectionName = keyof DatabaseSchemaRegistry extends never
  ? string
  : Extract<keyof DatabaseSchemaRegistry, string>

/** Default connection name from augmentation */
export type DefaultConnectionName =
  DefaultDatabaseConnection extends { name: infer N extends string } ? N : string

/** Resolve schema type for a named connection */
export type InferConnectionSchema<K extends string> =
  K extends keyof DatabaseSchemaRegistry
  ? DatabaseSchemaRegistry[K] extends SchemaDef ? DatabaseSchemaRegistry[K] : SchemaDef
  : SchemaDef

/** Union of all registered schemas (used by the event system for model name inference) */
export type InferDatabaseSchema = InferConnectionSchema<ConnectionName>

/**
 * Internal context used by database service for dynamic event emission
 * @internal
 */
export interface InternalDatabaseEventContext {
  data: unknown
  result?: unknown
}
