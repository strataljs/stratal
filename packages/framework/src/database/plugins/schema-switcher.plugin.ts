import { type RuntimePlugin } from "@zenstackhq/orm"
import { type SchemaDef } from "@zenstackhq/orm/schema"

export interface SchemaSwitcherPluginOptions {
  schemaName: string
}

/**
 * ZenStack runtime plugin that sets PostgreSQL search_path before each query.
 * Used for tenant isolation in multi-tenant applications.
 *
 * @example
 * ```typescript
 * super(schema, {
 *   dialect: new PostgresDialect({ pool }),
 *   plugins: [
 *     new SchemaSwitcherPlugin({ schemaName: `tenant_${tenantId}` })
 *   ]
 * })
 * ```
 */
export class SchemaSwitcherPlugin implements RuntimePlugin<SchemaDef, Record<string, unknown>, Record<string, unknown>> {
  readonly id = 'schema-switcher'

  constructor(private options: SchemaSwitcherPluginOptions) { }

  onQuery = async ({ args, proceed, client }: {
    args: Record<string, unknown> | undefined
    proceed: (args: Record<string, unknown> | undefined) => Promise<unknown>
    client: { $executeRawUnsafe: (sql: string) => Promise<unknown> }
  }): Promise<unknown> => {
    // Set search_path before each query
    await client.$executeRawUnsafe(`SET search_path TO "${this.options.schemaName}"`)
    return proceed(args)
  }
}
