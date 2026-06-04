import { type EntityMutationHooksDef, type RuntimePlugin } from '@zenstackhq/orm';
import { type SchemaDef } from '@zenstackhq/orm/schema';
import type { EventContext, EventName, IEventRegistry } from 'stratal/events';
import type { ModelName } from '../event-types';

export interface EventEmitterPluginOptions {
  eventRegistry: IEventRegistry
}

type EntityMutationAction = 'create' | 'update' | 'delete'

const ENTITY_ACTION_VERB = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
} as const satisfies Record<EntityMutationAction, string>

type Entity = Record<string, unknown>

/**
 * Pair before/after entity snapshots for a mutation. Rows are matched by
 * `id` when both sides carry one, falling back to positional pairing.
 */
function pairEntities(
  before: Entity[] | undefined,
  after: Entity[] | undefined
): { before: Entity | undefined; after: Entity | undefined }[] {
  const primary = after ?? before ?? []
  const counterpart = after ? before : undefined

  return primary.map((entity, index) => {
    const match = counterpart
      ? counterpart.find((c) => c.id !== undefined && c.id === entity.id) ?? counterpart[index]
      : undefined

    return after
      ? { before: match, after: entity }
      : { before: entity, after: undefined }
  })
}

/**
 * ZenStack runtime plugin that emits before/after events for database operations.
 *
 * Emits events in the format:
 * - `before.{Model}.{operation}` - Before the database operation
 * - `after.{Model}.{operation}` - After the database operation
 *
 * Additionally emits entity-mutation events carrying full entity snapshots:
 * - `entity.{Model}.created` - `{ after }`
 * - `entity.{Model}.updated` - `{ before, after }`
 * - `entity.{Model}.deleted` - `{ before }`
 *
 * Entity events are listener-driven: the pre-mutation snapshot is only
 * loaded (inside the mutation's transaction) when `hasListeners()` reports
 * a matching subscription, so models nobody observes pay no cost. Note that
 * a wildcard subscription (`entity`) therefore makes every model pay the
 * pre-read — subscribe per model when cost matters.
 *
 * @example
 * ```typescript
 * super(schema, {
 *   dialect: new PostgresDialect({ pool }),
 *   plugins: [
 *     new EventEmitterPlugin({
 *       eventRegistry,
 *     })
 *   ]
 * })
 * ```
 */
export class EventEmitterPlugin implements RuntimePlugin<SchemaDef, Record<string, unknown>, Record<string, unknown>, {}> {
  readonly id = 'event-emitter'

  constructor(private options: EventEmitterPluginOptions) { }

  onEntityMutation: EntityMutationHooksDef<SchemaDef> = {
    // Run after-hooks inside the mutation's transaction boundary so they
    // execute within the caller's async context (AsyncLocalStorage intact):
    // listeners resolve from the live request scope and tenant schema
    // switching still applies. Post-commit hooks would run detached from the
    // request's ALS. Listeners registered `blocking: false` still do their
    // real work outside the transaction via waitUntil.
    runAfterMutationWithinTransaction: true,

    beforeEntityMutation: async (args) => {
      // Created rows have no prior state to snapshot
      if (args.action === 'create') return

      const event = `entity.${args.model}.${ENTITY_ACTION_VERB[args.action]}` as EventName
      if (!this.options.eventRegistry.hasListeners(event)) return

      // Runs inside the mutation's transaction; ZenStack hands the result
      // to afterEntityMutation as `beforeMutationEntities`
      await args.loadBeforeMutationEntities()
    },

    afterEntityMutation: async (args) => {
      const { model, action, beforeMutationEntities } = args
      const verb = ENTITY_ACTION_VERB[action]
      const event = `entity.${model}.${verb}` as EventName
      const { eventRegistry } = this.options

      if (!eventRegistry.hasListeners(event)) return

      const after = action === 'delete' ? undefined : await args.loadAfterMutationEntities()

      for (const pair of pairEntities(beforeMutationEntities, after)) {
        // Producer boundary: ZenStack types `model` as plain string, but at
        // runtime it is always a schema model name — assert that one fact.
        const context: EventContext<'entity'> = {
          model: model as ModelName,
          action: verb,
          before: pair.before,
          after: pair.after,
        }
        await eventRegistry.emit(event, context)
      }
    },
  }

  onQuery = async ({ model, operation, args, proceed }: {
    model: string
    operation: string
    args: Record<string, unknown> | undefined
    proceed: (args: Record<string, unknown> | undefined) => Promise<unknown>
  }): Promise<unknown> => {
    const { eventRegistry } = this.options
    const eventBase = `${model}.${operation}`

    // Emit BEFORE event
    await eventRegistry.emit(`before.${eventBase}` as EventName, {
      data: args,
    })

    // Execute the actual database operation
    const result = await proceed(args)

    // Emit AFTER event
    await eventRegistry.emit(`after.${eventBase}` as EventName, {
      data: args,
      result,
    })

    return result
  }
}
