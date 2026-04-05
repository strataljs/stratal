interface SwitchableClient {
  $schema: { provider: { defaultSchema: string } } & Record<string, unknown>
  schema: unknown
}

/**
 * Switches the active schema on a ZenStack/Kysely database client by mutating
 * `$schema.provider.defaultSchema`. This causes ZenStack's QueryNameMapper to
 * generate fully-qualified table references (e.g. `"tenant_123"."User"`).
 *
 * Must be called BEFORE any queries are made on the client.
 *
 * Note: The ZenStack RuntimePlugin `onQuery` hook fires after table names are
 * already resolved, so a plugin-based approach cannot set the schema prefix.
 * Direct client mutation is the only supported method.
 */
export class SchemaSwitcher {
  static apply<T>(client: T, schemaName: string): T {
    const c = client as unknown as SwitchableClient
    const switched = {
      ...c.$schema,
      provider: { ...c.$schema.provider, defaultSchema: schemaName },
    }
    c.$schema = switched
    c.schema = switched
    return client
  }
}
