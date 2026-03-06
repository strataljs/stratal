import { type RuntimePlugin } from '@zenstackhq/orm'
import { type SchemaDef } from '@zenstackhq/orm/schema'
import type { EventName, IEventRegistry } from 'stratal/events'

export interface EventEmitterPluginOptions {
  eventRegistry: IEventRegistry
}

/**
 * ZenStack runtime plugin that emits before/after events for database operations.
 *
 * Emits events in the format:
 * - `before.{Model}.{operation}` - Before the database operation
 * - `after.{Model}.{operation}` - After the database operation
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
export class EventEmitterPlugin implements RuntimePlugin<SchemaDef, Record<string, unknown>, Record<string, unknown>> {
  readonly id = 'event-emitter'

  constructor(private options: EventEmitterPluginOptions) { }

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
