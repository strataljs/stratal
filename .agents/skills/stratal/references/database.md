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
