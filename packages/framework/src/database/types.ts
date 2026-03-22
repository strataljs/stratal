import type { SchemaDef } from '@zenstackhq/schema'
import type { StratalDatabase } from './index'

/**
 * Re-exported from the barrel (`./index`) where it's declared.
 * This ensures `declare module '@stratal/framework/database'` augmentations
 * merge into the same module, avoiding TypeScript's re-export forking
 * limitation (microsoft/TypeScript#18877).
 */
export type { StratalDatabase }

/** Infer schema type for a specific connection */
export type InferConnectionSchema<K extends string> =
  StratalDatabase extends { schemas: infer R }
  ? K extends keyof R ? R[K] extends SchemaDef ? R[K] : SchemaDef : SchemaDef
  : SchemaDef

/** Union of ALL schemas across connections (for events) */
export type InferAnySchema =
  StratalDatabase extends { schemas: infer R }
  ? R[keyof R] extends SchemaDef ? R[keyof R] : SchemaDef
  : SchemaDef

/** Connection name — derived from schemas keys */
export type ConnectionName =
  StratalDatabase extends { schemas: infer R }
  ? keyof R extends never ? string : Extract<keyof R, string>
  : string

/** Default connection name */
export type DefaultConnectionName =
  StratalDatabase extends { defaultConnection: infer N extends string } ? N : string

/**
 * Internal context used by database service for dynamic event emission
 * @internal
 */
export interface InternalDatabaseEventContext {
  data: unknown
  result?: unknown
}
