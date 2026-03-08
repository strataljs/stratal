---
name: stratal-zenstack-plugin
description: >-
  Use when working with @stratal/zenstack-plugin — multi-connection schema slicing,
  database migrations, and the stratal-db CLI. Trigger on: zenstack-plugin,
  @@connection, stratal-db, migrations, multi-connection, slicing,
  @stratal/zenstack-plugin.
user-invocable: false
license: MIT
metadata:
  author: Temitayo Fadojutimi
  version: "2.0"
---

# @stratal/zenstack-plugin

ZenStack plugin for Stratal that enables multi-connection database support through schema slicing and connection-specific migrations. It splits a single `.zmodel` schema into per-connection schemas based on the `@@connection` attribute.

## Plugin Setup

In your `.zmodel` file:

```zmodel
plugin stratal {
  provider = '@stratal/zenstack-plugin'
  output = './zenstack'
  default = 'main'
}

model User {
  id String @id @default(cuid())
  @@connection('main')
}

model AuditLog {
  id String @id @default(cuid())
  @@connection('analytics')
}
```

Models without `@@connection` are assigned to the `default` connection.

## Generated Output

After running `npx zenstack generate`, the plugin produces:

- `slicing.ts` — Export map used by `DatabaseModule` for connection-aware query routing
- Per-connection schemas — Separate Prisma schemas for each connection (used for migrations)

## CLI: stratal-db

| Command | Description |
|---|---|
| `stratal-db migrate dev --connection <name> --name <name>` | Create a new migration |
| `stratal-db migrate deploy --connection <name>` | Apply pending migrations |
| `stratal-db migrate reset --connection <name>` | Reset database and re-apply migrations |
| `stratal-db push --connection <name>` | Push schema changes without migration files |
| `stratal-db migrate dev --all-connections` | Run migration on all connections at once |

**Common options:** `--connection <name>` to target a specific connection, `--all-connections` to target all.

## Conventions

- Always set a `default` connection in the plugin config
- Run `npx zenstack generate` before `stratal-db` commands to update schemas
- The generated `slicing.ts` integrates directly with `DatabaseModule.forRoot()` via the `slicing` option on each connection
- Cross-connection relations are validated at generation time — models in different connections cannot have direct relations
