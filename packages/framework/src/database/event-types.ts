/**
 * Database Event Types
 *
 * All ZenStack-dependent event types derived from the shared database schema.
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
import type { InferAnySchema } from './types'

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
 * Distributive helper — extracts model names from each schema member individually.
 * Using a naked type parameter ensures TypeScript distributes over unions:
 * `_ExtractModelNames<A | B>` = `_ExtractModelNames<A> | _ExtractModelNames<B>`
 */
type _ExtractModelNames<S> = S extends { models: infer M } ? Extract<keyof M, string> : never

/**
 * Model names derived from the shared database schema.
 * Distributes over all schema types so models from every connection are included.
 */
export type ModelName = _ExtractModelNames<InferAnySchema>

// ============================================================================
// Event Names
// ============================================================================

/**
 * Database event names with all supported patterns.
 */
export type DatabaseEventName =
  | `${EventPhase}.${ModelName}.${DatabaseOperation}`
  | `${EventPhase}.${ModelName}`
  | `${EventPhase}.${DatabaseOperation}`
  | EventPhase

// ============================================================================
// Args & Result Mapping
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
 * Distributive helper — resolves data/where args for a model against each schema individually.
 */
type _ExtractData<S, M extends string, O extends DatabaseOperation> =
  S extends SchemaDef
  ? M extends Extract<keyof S['models'], string>
  ? OperationArgsMap<S, M, O> extends { data: infer D }
  ? D
  : OperationArgsMap<S, M, O> extends { where: infer W }
  ? W
  : OperationArgsMap<S, M, O>
  : never
  : never

/**
 * Extract the data/where property from operation args.
 * Distributes over all schemas to find the matching model.
 */
export type GetData<M extends ModelName, O extends DatabaseOperation> =
  _ExtractData<InferAnySchema, M, O> extends never ? unknown : _ExtractData<InferAnySchema, M, O>

/**
 * Distributive helper — resolves result type for a model against each schema individually.
 */
type _ExtractResult<S, M extends string, O extends DatabaseOperation> =
  S extends SchemaDef
  ? M extends Extract<keyof S['models'], string>
  ? O extends 'findMany' | 'createMany' | 'updateMany' | 'deleteMany'
  ? ModelResult<S, M>[]
  : O extends 'count'
  ? number
  : ModelResult<S, M>
  : never
  : never

/**
 * Extract result type for a model operation.
 * Distributes over all schemas to find the matching model.
 */
export type GetResult<M extends ModelName, O extends DatabaseOperation> =
  _ExtractResult<InferAnySchema, M, O> extends never ? unknown : _ExtractResult<InferAnySchema, M, O>

// ============================================================================
// Entity Mutation Events
// ============================================================================

/**
 * Verb suffix for entity-mutation events (`entity.{Model}.{verb}`).
 */
export type EntityMutationVerb = 'created' | 'updated' | 'deleted'

/**
 * Entity-mutation event names with all supported patterns.
 *
 * Unlike `before.*`/`after.*` (raw query args/result), entity events carry
 * full entity snapshots: `created` has `after`, `updated` has `before` and
 * `after`, `deleted` has `before`. The pre-mutation snapshot is loaded inside
 * the mutation's transaction, and only when a listener matches — a wildcard
 * subscription (`entity`) makes every model pay that pre-read, so subscribe
 * per model when cost matters.
 */
export type EntityEventName =
  | `entity.${ModelName}.${EntityMutationVerb}`
  | `entity.${ModelName}`
  | `entity.${EntityMutationVerb}`
  | 'entity'

/**
 * Distributive helper — resolves the full entity shape for a model.
 */
type _ExtractEntity<S, M extends string> =
  S extends SchemaDef
  ? M extends Extract<keyof S['models'], string>
  ? ModelResult<S, M>
  : never
  : never

/**
 * Full entity snapshot type for a model, across all connections' schemas.
 */
export type GetEntity<M extends ModelName> =
  _ExtractEntity<InferAnySchema, M> extends never ? unknown : _ExtractEntity<InferAnySchema, M>

interface EntityCreatedEventContext<M extends ModelName> {
  model: M
  action: 'created'
  before: undefined
  after: GetEntity<M>
}

interface EntityUpdatedEventContext<M extends ModelName> {
  model: M
  action: 'updated'
  before: GetEntity<M>
  after: GetEntity<M>
}

interface EntityDeletedEventContext<M extends ModelName> {
  model: M
  action: 'deleted'
  before: GetEntity<M>
  after: undefined
}

/** Context for model wildcard subscriptions (e.g. "entity.User") */
interface EntityModelWildcardContext<M extends ModelName> {
  model: M
  action: EntityMutationVerb
  before: GetEntity<M> | undefined
  after: GetEntity<M> | undefined
}

/** Context for verb wildcard subscriptions (e.g. "entity.updated") */
interface EntityVerbWildcardContext<V extends EntityMutationVerb> {
  model: ModelName
  action: V
  before: V extends 'created' ? undefined : unknown
  after: V extends 'deleted' ? undefined : unknown
}

/** Context for the global wildcard subscription ("entity") */
interface EntityWildcardContext {
  model: ModelName
  action: EntityMutationVerb
  before: unknown
  after: unknown
}

type EntityEventContext<E extends string> =
  E extends `entity.${infer M extends ModelName}.created` ? EntityCreatedEventContext<M>
  : E extends `entity.${infer M extends ModelName}.updated` ? EntityUpdatedEventContext<M>
  : E extends `entity.${infer M extends ModelName}.deleted` ? EntityDeletedEventContext<M>
  : E extends `entity.${infer M extends ModelName}` ? EntityModelWildcardContext<M>
  : E extends `entity.${infer V extends EntityMutationVerb}` ? EntityVerbWildcardContext<V>
  : EntityWildcardContext

/**
 * Mapped type producing all entity-mutation event name → context pairs.
 */
export type EntityEvents = {
  [E in EntityEventName]: EntityEventContext<E>
}

// ============================================================================
// Parse Event String
// ============================================================================

/**
 * Parse event string into structured type for discriminated unions
 */
export type ParseEvent<E extends string> =
  E extends `${infer Phase extends EventPhase}.${infer Model extends ModelName}.${infer Op extends DatabaseOperation}`
  ? { phase: Phase; model: Model; operation: Op; type: 'exact' }
  : E extends `${infer Phase extends EventPhase}.${infer Second}`
  ? Second extends ModelName
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
  M extends ModelName,
  O extends DatabaseOperation,
  Phase extends EventPhase
> extends BaseEventContext {
  data: Phase extends 'before' ? GetData<M, O> : Readonly<GetData<M, O>>
  result: Phase extends 'after' ? GetResult<M, O> : undefined
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
  Phase extends EventPhase
> extends BaseEventContext {
  model: ModelName
  data: Phase extends 'before' ? unknown : Readonly<unknown>
  result: Phase extends 'after' ? unknown : undefined
}

/** Context for phase wildcard events (e.g., "after" or "before") */
interface PhaseWildcardEventContext<
  Phase extends EventPhase
> extends BaseEventContext {
  model: ModelName
  operation: DatabaseOperation
  data: Phase extends 'before' ? unknown : Readonly<unknown>
  result: Phase extends 'after' ? unknown : undefined
}

// ============================================================================
// DatabaseEventContext — the rich discriminated union
// ============================================================================

/**
 * Type-safe event context with discriminated unions.
 */
type DatabaseEventContext<E extends string> =
  ParseEvent<E> extends {
    phase: infer P extends EventPhase
    model: infer M extends ModelName
    operation: infer O extends DatabaseOperation
    type: 'exact'
  }
  ? ExactDatabaseEventContext<M, O, P>
  : ParseEvent<E> extends {
    phase: infer P extends EventPhase
    model: infer _M extends ModelName
    type: 'model-wildcard'
  }
  ? ModelWildcardEventContext<P>
  : ParseEvent<E> extends {
    phase: infer P extends EventPhase
    operation: infer _O extends DatabaseOperation
    type: 'operation-wildcard'
  }
  ? OperationWildcardEventContext<P>
  : ParseEvent<E> extends { phase: infer P extends EventPhase; type: 'phase-wildcard' }
  ? PhaseWildcardEventContext<P>
  : BaseEventContext

// ============================================================================
// DatabaseEvents — the utility type for augmenting CustomEventRegistry
// ============================================================================

/**
 * Mapped type that produces all database event name to context pairs.
 *
 * Used to augment core's `CustomEventRegistry`:
 *
 * @example
 * ```typescript
 * declare module 'stratal/events' {
 *   interface CustomEventRegistry extends DatabaseEvents {}
 * }
 * ```
 */
export type DatabaseEvents = {
  [E in DatabaseEventName]: DatabaseEventContext<E>
}

// ============================================================================
// Auto-augment core's CustomEventRegistry
// ============================================================================

declare module 'stratal/events' {
  interface CustomEventRegistry extends DatabaseEvents, EntityEvents { }
}
