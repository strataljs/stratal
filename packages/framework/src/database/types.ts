import type { RuntimePlugin } from '@zenstackhq/orm'
import type { SchemaDef } from '@zenstackhq/schema'

/**
 * Augment with per-connection schemas, default connection, and plugin types.
 *
 * Each property can be augmented in a separate file — TypeScript merges them.
 *
 * @example
 * ```typescript
 * // db/schema.ts
 * declare module '@stratal/framework/database' {
 *   interface StratalDatabase {
 *     schemas: {
 *       main: typeof schema
 *       tenant: typeof tenantSchema
 *     }
 *     defaultConnection: 'main'
 *   }
 * }
 *
 * // db/plugins.ts
 * declare module '@stratal/framework/database' {
 *   interface StratalDatabase {
 *     plugins: {
 *       main: [typeof queryResultPlugin, typeof cachePlugin]
 *     }
 *   }
 * }
 * ```
 */
export interface StratalDatabase {}

/** Extract `ExtQueryArgs` from a `RuntimePlugin` */
type ExtractPluginQueryArgs<P> =
  P extends RuntimePlugin<infer _S, infer Q, infer _M, infer _R> ? Q : {}

/** Extract `ExtClientMembers` from a `RuntimePlugin` */
type ExtractPluginClientMembers<P> =
  P extends RuntimePlugin<infer _S, infer _Q, infer M, infer _R> ? M : {}

/** Extract `ExtResult` from a `RuntimePlugin` */
type ExtractPluginResult<P> =
  P extends RuntimePlugin<infer _S, infer _Q, infer _M, infer R> ? R : {}

/** Recursively intersect extension types from a tuple of plugins */
type MergePlugins<Plugins extends unknown[]> =
  Plugins extends [infer P, ...infer Rest]
    ? {
        extQueryArgs: ExtractPluginQueryArgs<P> & MergePlugins<Rest>['extQueryArgs']
        extClientMembers: ExtractPluginClientMembers<P> & MergePlugins<Rest>['extClientMembers']
        extResult: ExtractPluginResult<P> & MergePlugins<Rest>['extResult']
      }
    : { extQueryArgs: {}; extClientMembers: {}; extResult: {} }

/** Infer merged plugin extensions for a connection */
export type InferConnectionExtensions<K extends string> =
  StratalDatabase extends { plugins: infer P }
    ? K extends keyof P
      ? P[K] extends unknown[]
        ? MergePlugins<P[K]>
        : { extQueryArgs: {}; extClientMembers: {}; extResult: {} }
      : { extQueryArgs: {}; extClientMembers: {}; extResult: {} }
    : { extQueryArgs: {}; extClientMembers: {}; extResult: {} }

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
