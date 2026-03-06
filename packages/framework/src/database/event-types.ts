/**
 * Database Event Types
 *
 * All ZenStack-dependent event types, parameterized by connection name.
 * These types power the auto-complete and type-safe event contexts for
 * database events like `after.User.create`.
 *
 * This module auto-augments core's `CustomEventRegistry` with `DatabaseEvents`,
 * so that `EventContext<'after.User.create'>` resolves to a richly typed context
 * with `data` and `result` derived from the ZenStack schema.
 */

import type {
  AggregateArgs,
  AllCrudOperations,
  CountArgs,
  CreateArgs,
  CreateManyArgs,
  DeleteArgs,
  DeleteManyArgs,
  FindFirstArgs,
  FindManyArgs,
  FindUniqueArgs,
  GroupByArgs,
  ModelResult,
  UpdateArgs,
  UpdateManyArgs,
  UpsertArgs,
} from '@zenstackhq/orm'
import type { SchemaDef } from '@zenstackhq/schema'
import type { ConnectionName, InferConnectionSchema } from './types'

// ============================================================================
// Core Types
// ============================================================================

/**
 * Event phase: before or after operation
 */
export type EventPhase = 'before' | 'after'

/**
 * All database operations that can trigger events
 */
export type DatabaseOperation = AllCrudOperations

/**
 * Model names derived from a connection's schema.
 * Falls back to `never` if no schemas are registered.
 */
export type ModelName<K extends ConnectionName = ConnectionName> =
  InferConnectionSchema<K> extends { models: infer M }
  ? Extract<keyof M, string>
  : never

// ============================================================================
// Event Names
// ============================================================================

/**
 * Database event names with all supported patterns, parameterized by connection.
 */
export type DatabaseEventName<K extends ConnectionName = ConnectionName> =
  | `${EventPhase}.${ModelName<K>}.${DatabaseOperation}`
  | `${EventPhase}.${ModelName<K>}`
  | `${EventPhase}.${DatabaseOperation}`
  | EventPhase

// ============================================================================
// Args & Result Mapping (parameterized by connection)
// ============================================================================

/**
 * Map operation name to ZenStack Args type for a given schema and model
 */
type OperationArgsMap<
  S extends SchemaDef,
  M extends Extract<keyof S['models'], string>,
  O extends DatabaseOperation
> =
  O extends 'create' ? CreateArgs<S, M> :
  O extends 'createMany' ? CreateManyArgs<S, M> :
  O extends 'update' ? UpdateArgs<S, M> :
  O extends 'updateMany' ? UpdateManyArgs<S, M> :
  O extends 'delete' ? DeleteArgs<S, M> :
  O extends 'deleteMany' ? DeleteManyArgs<S, M> :
  O extends 'findUnique' ? FindUniqueArgs<S, M> :
  O extends 'findFirst' ? FindFirstArgs<S, M> :
  O extends 'findMany' ? FindManyArgs<S, M> :
  O extends 'upsert' ? UpsertArgs<S, M> :
  O extends 'count' ? CountArgs<S, M> :
  O extends 'aggregate' ? AggregateArgs<S, M> :
  O extends 'groupBy' ? GroupByArgs<S, M> :
  never

/**
 * Extract the data/where property from operation args for a connection.
 */
export type GetData<K extends ConnectionName, M extends ModelName<K>, O extends DatabaseOperation> =
  M extends Extract<keyof InferConnectionSchema<K>['models'], string>
  ? OperationArgsMap<InferConnectionSchema<K>, M, O> extends { data: infer D }
  ? D
  : OperationArgsMap<InferConnectionSchema<K>, M, O> extends { where: infer W }
  ? W
  : OperationArgsMap<InferConnectionSchema<K>, M, O>
  : unknown

/**
 * Extract result type for a model operation on a connection.
 */
export type GetResult<K extends ConnectionName, M extends ModelName<K>, O extends DatabaseOperation> =
  M extends Extract<keyof InferConnectionSchema<K>['models'], string>
  ? O extends 'findMany' | 'createMany' | 'updateMany' | 'deleteMany'
  ? ModelResult<InferConnectionSchema<K>, M>[]
  : O extends 'count'
  ? number
  : ModelResult<InferConnectionSchema<K>, M>
  : unknown

// ============================================================================
// Parse Event String
// ============================================================================

/**
 * Parse event string into structured type for discriminated unions
 */
export type ParseEvent<K extends ConnectionName, E extends string> =
  E extends `${infer Phase extends EventPhase}.${infer Model extends ModelName<K>}.${infer Op extends DatabaseOperation}`
  ? { phase: Phase; model: Model; operation: Op; type: 'exact' }
  : E extends `${infer Phase extends EventPhase}.${infer Second}`
  ? Second extends ModelName<K>
  ? { phase: Phase; model: Second; type: 'model-wildcard' }
  : Second extends DatabaseOperation
  ? { phase: Phase; operation: Second; type: 'operation-wildcard' }
  : never
  : E extends EventPhase
  ? { phase: E; type: 'phase-wildcard' }
  : never

// ============================================================================
// Discriminated Union Event Context Types
// ============================================================================

/** Base context fields present in all events */
interface BaseEventContext {
}

/** Context for exact database events (e.g., "after.User.create") */
interface ExactDatabaseEventContext<
  K extends ConnectionName,
  M extends ModelName<K>,
  O extends DatabaseOperation,
  Phase extends EventPhase
> extends BaseEventContext {
  data: Phase extends 'before' ? GetData<K, M, O> : Readonly<GetData<K, M, O>>
  result: Phase extends 'after' ? GetResult<K, M, O> : undefined
}

/** Context for model wildcard events (e.g., "after.User") */
interface ModelWildcardEventContext<
  Phase extends EventPhase
> extends BaseEventContext {
  operation: DatabaseOperation
  data: Phase extends 'before' ? unknown : Readonly<unknown>
  result: Phase extends 'after' ? unknown : undefined
}

/** Context for operation wildcard events (e.g., "after.create") */
interface OperationWildcardEventContext<
  K extends ConnectionName,
  Phase extends EventPhase
> extends BaseEventContext {
  model: ModelName<K>
  data: Phase extends 'before' ? unknown : Readonly<unknown>
  result: Phase extends 'after' ? unknown : undefined
}

/** Context for phase wildcard events (e.g., "after" or "before") */
interface PhaseWildcardEventContext<
  K extends ConnectionName,
  Phase extends EventPhase
> extends BaseEventContext {
  model: ModelName<K>
  operation: DatabaseOperation
  data: Phase extends 'before' ? unknown : Readonly<unknown>
  result: Phase extends 'after' ? unknown : undefined
}

// ============================================================================
// DatabaseEventContext — the rich discriminated union
// ============================================================================

/**
 * Type-safe event context with discriminated unions, parameterized by connection.
 */
type DatabaseEventContext<K extends ConnectionName, E extends string> =
  ParseEvent<K, E> extends {
    phase: infer P extends EventPhase
    model: infer M extends ModelName<K>
    operation: infer O extends DatabaseOperation
    type: 'exact'
  }
  ? ExactDatabaseEventContext<K, M, O, P>
  : ParseEvent<K, E> extends {
    phase: infer P extends EventPhase
    model: infer _M extends ModelName<K>
    type: 'model-wildcard'
  }
  ? ModelWildcardEventContext<P>
  : ParseEvent<K, E> extends {
    phase: infer P extends EventPhase
    operation: infer _O extends DatabaseOperation
    type: 'operation-wildcard'
  }
  ? OperationWildcardEventContext<K, P>
  : ParseEvent<K, E> extends { phase: infer P extends EventPhase; type: 'phase-wildcard' }
  ? PhaseWildcardEventContext<K, P>
  : BaseEventContext

// ============================================================================
// DatabaseEvents — the utility type for augmenting CustomEventRegistry
// ============================================================================

/**
 * Mapped type that produces all database event name → context pairs for a connection.
 *
 * Used to augment core's `CustomEventRegistry`:
 *
 * @example Augment with all connections (default)
 * ```typescript
 * declare module 'stratal/events' {
 *   interface CustomEventRegistry extends DatabaseEvents {}
 * }
 * ```
 *
 * @example Narrow to a specific connection
 * ```typescript
 * declare module 'stratal/events' {
 *   interface CustomEventRegistry extends DatabaseEvents<'main'> {}
 * }
 * ```
 */
export type DatabaseEvents<K extends ConnectionName = ConnectionName> = {
  [E in DatabaseEventName<K>]: DatabaseEventContext<K, E>
}

// ============================================================================
// Auto-augment core's CustomEventRegistry
// ============================================================================

declare module 'stratal/events' {
  interface CustomEventRegistry extends DatabaseEvents { }
}
