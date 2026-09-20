# Database (ZenStack ORM)

## Setup

Install `@stratal/framework` and `pg` (if using PostgreSQL).

### DatabaseModule Configuration

```typescript
import { DatabaseModule } from '@stratal/framework/database'
import { inject } from 'stratal/di'
import { schema } from '../zenstack/schema'

@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env) => ({
        default: 'main',
        connections: [
          {
            name: 'main',
            schema,
            dialect: () => createPostgresDialect(env.HYPERDRIVE.connectionString),
          },
        ],
      }),
    }),
  ],
})
export class AppModule {}
```

### Configuration Shape

```typescript
interface DatabaseModuleConfig {
  default: string                          // Name of the default connection
  connections: DatabaseConnectionConfig[]  // Array of connection configs
}

interface DatabaseConnectionConfig {
  name: string                             // Connection identifier
  schema: SchemaDef                        // ZenStack generated schema
  dialect: () => Dialect                   // Factory returning a Kysely Dialect
  plugins?: AnyPlugin[]                    // ZenStack runtime plugins
}
```

### Multiple Named Connections

```typescript
DatabaseModule.forRootAsync({
  inject: [DI_TOKENS.CloudflareEnv],
  useFactory: (env) => ({
    default: 'main',
    connections: [
      {
        name: 'main',
        schema: mainSchema,
        dialect: () => createPostgresDialect(env.MAIN_DB.connectionString),
      },
      {
        name: 'analytics',
        schema: analyticsSchema,
        dialect: () => createPostgresDialect(env.ANALYTICS_DB.connectionString),
      },
    ],
  }),
})
```

## Injecting Database

```typescript
import { InjectDB } from '@stratal/framework/database'
import type { DatabaseService } from '@stratal/framework/database'
import { Transient, inject } from 'stratal/di'

@Transient()
export class NotesRepository {
  constructor(
    @InjectDB() private db: DatabaseService,              // Default connection
    @InjectDB('analytics') private analyticsDb: DatabaseService, // Named connection
  ) {}

  async findAll() {
    return this.db.note.findMany()
  }
}
```

## Type Augmentation

For type-safe database access, augment the `StratalDatabase` interface:

```typescript
// src/types/database.d.ts
import type { PrismaClient } from '../zenstack/prisma'

declare module '@stratal/framework/database' {
  interface StratalDatabase {
    schemas: {
      main: PrismaClient
      analytics: AnalyticsPrismaClient
    }
    defaultConnection: 'main'
  }
}
```

## ZenStack Schema

Define your schema in a `.zmodel` file:

```zmodel
// schema.zmodel
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Note {
  id        String   @id @default(uuid())
  title     String
  content   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Generate with: `npx zenstack generate --schema=schema.zmodel`

## Reading by Cursor

`db.$cursor.<model>.findMany()` reads rows from a position in an ordering. It has no page numbers, no total, and no last page — a cursor names a row, and the query walks forward or backward from it. In exchange it stays correct while rows are inserted, deleted and updated around the reader, which is what it is for.

```typescript
const page = await this.db.$cursor.thread.findMany({
  cursor: ctx.query('cursor'),                        // opaque; null on the first page
  take: 20,
  orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  where: { userId },
})
```

Returns `{ data, perPage, cursorName, cursor, nextCursor, prevCursor }`. Return it straight from a JSON route, walk it from a client, or pass it to `ctx.scroll()` — it derives with no `metadata` callback (see `references/inertia.md`). Cursors are opaque: never build one, pass back one a result gave you.

| Option | Default | Purpose |
|---|---|---|
| `cursor` | `null` | The cursor to read from. `null` is the first page. |
| `take` | — | Rows per page. Required. |
| `orderBy` | — | Required. One clause or an array, applied left to right. The model's own columns only. |
| `uniqueBy` | `'id'` | The ordering column that makes the ordering total. Must appear in `orderBy`. |
| `where` / `include` / `select` / `omit` | — | As on the model's own `findMany`. `select` narrows the row type. |
| `cursorName` | `'cursor'` | Query parameter name the cursor travels under. |

**Do not reach for ZenStack's own `cursor` on `db.thread.findMany()`.** It is a different thing that shares the name: it takes a `WhereUniqueInput` (`{ id }`) and looks the row's ordering values up by subquery at query time. It is correct only while the list holds still. Once the row it names is deleted it answers an **empty page**; once that row is excluded by the query's own `where` it **skips** a row; once that row's ordering column changes it **repeats** one. All three are silent. `db.$cursor` carries the ordering values in the cursor instead, and does not expose `cursor` or `skip`.

Order on a unique column, or on a set ending in one. `updatedAt` alone leaves tied rows sharing a position, and paging over a tie skips or repeats — so write the tie-breaker yourself:

```typescript
orderBy: { updatedAt: 'desc' }                        // throws
orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]      // correct
```

It is never appended for you: an ordering you did not write is an ordering you cannot reason about. `$cursor` throws `CursorOrderingError` rather than return wrong rows when `orderBy` is missing, when it does not include `uniqueBy`, when an ordering column is absent from the returned row (a `select` dropped it), or when one is null — all programming errors, carrying no HTTP status. A cursor that cannot be read is a separate `MalformedCursorError`, which extends `HttpException` with a 400 — let it surface, the same as any other damaged input from the URL. Do not catch it to serve the first page. Both are imported from `@stratal/framework/database`.

The result carries no `path` or page URLs. Building a URL is a routing decision — which route, which query parameters to keep, whether a trailing slash is canonical — so a route builds its own links with `ctx.route()` plus the cursor.

`db.$cursor` covers every model in the schema, and a transaction client carries the same reader: inside `db.$transaction(...)`, `tx.$cursor.thread.findMany({ … })` takes the same arguments and returns the same result.

To page a query that is not a model read — a `UNION`, a raw statement — supply your own `findMany` to `$from`. Use `tx.$cursor.$from(...)` inside a transaction, for the same reason:

```typescript
import { type CursorFindManyArgs } from '@stratal/framework/database'

const page = await this.db.$cursor.$from(
  { findMany: (args: CursorFindManyArgs) => this.searchThreads(args) },
  { cursor: ctx.query('cursor'), take: 20, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] },
)
```

The row type comes from what `findMany` resolves to, and `orderBy` and `uniqueBy` are keyed to it — ordering on a column the query does not return is a compile error. Takes `cursor`, `take`, `orderBy`, `uniqueBy`, `where` and `cursorName`; no `select`, `include` or `omit`, because your `findMany` decides what it returns. Narrow inside it instead.

Your `findMany` receives `{ where?, orderBy?, take? }` and must apply all three: `where` carries the keyset condition that positions the page, `orderBy` may be reversed from the one you passed (a backward read), and `take` is one row over the page size, which is how the next page is detected. Drop any of them and the paging is wrong.

## Plugins

Three built-in database plugins:

### ErrorHandler Plugin (Auto configured)
Catches database errors and converts them to structured `ApplicationError` subclasses.

### EventEmitter Plugin (Auto configured)
Emits events before/after database operations. Events follow the pattern `{phase}.{Model}.{operation}`:
- `before.Note.create`, `after.Note.create`
- `before.Note.update`, `after.Note.update`
- `before.Note.delete`, `after.Note.delete`

### SchemaSwitcher Plugin
Switches PostgreSQL schemas per-request (multi-tenant support).

## Database Events

See `references/events.md` for event listener patterns and database event wildcards.

## Transaction Support

ZenStack supports transactions via the ORM:

```typescript
await this.db.$transaction(async (tx) => {
  const note = await tx.note.create({ data: { title: 'New' } })
  await tx.tag.create({ data: { noteId: note.id, name: 'urgent' } })
})
```
