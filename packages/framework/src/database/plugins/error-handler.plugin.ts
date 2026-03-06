import { type RuntimePlugin } from '@zenstackhq/orm'
import { type SchemaDef } from '@zenstackhq/orm/schema'
import { fromZenStackError } from '../errors'

/**
 * ZenStack runtime plugin that transforms ORM errors into ApplicationError instances.
 *
 * @example
 * ```typescript
 * super(schema, {
 *   dialect: new PostgresDialect({ pool }),
 *   plugins: [new ErrorHandlerPlugin()]
 * })
 * ```
 */
export class ErrorHandlerPlugin implements RuntimePlugin<SchemaDef, Record<string, unknown>, Record<string, unknown>> {
  readonly id = 'error-handler'

  onQuery = async ({ args, proceed }: {
    args: Record<string, unknown> | undefined
    proceed: (args: Record<string, unknown> | undefined) => Promise<unknown>
  }): Promise<unknown> => {
    try {
      return await proceed(args)
    } catch (error) {
      throw fromZenStackError(error)
    }
  }
}
