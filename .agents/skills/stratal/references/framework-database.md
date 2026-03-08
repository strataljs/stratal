# Database Module

## Installation

```bash
npm install @stratal/framework
npm install @zenstackhq/orm pg               # required peer deps for database
```

## DatabaseModule Setup

### Configuration Interfaces

```typescript
interface DatabaseConnectionConfig {
  name: string           // Connection identifier (must be unique)
  schema: SchemaDef      // ZenStack schema definition
  dialect: () => Dialect  // Factory that returns a Kysely dialect — defers I/O (e.g., Pool creation) to first use
  plugins?: AnyPlugin[]  // Optional ZenStack plugins
}

interface DatabaseModuleConfig {
  default: string                         // Default connection name (must exist in connections)
  connections: DatabaseConnectionConfig[] // At least one connection
}
```

### forRoot() (Synchronous)

```typescript
import { DatabaseModule } from '@stratal/framework/database'

@Module({
  imports: [
    DatabaseModule.forRoot({
      default: 'main',
      connections: [
        {
          name: 'main',
          schema: mainSchema,
          dialect: () => new PostgresDialect({ pool }),
        },
      ],
    }),
  ],
})
export class AppModule {}
```

### forRootAsync() (Asynchronous)

```typescript
import { DatabaseModule } from '@stratal/framework/database'

@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [CONFIG_TOKENS.ConfigService],
      useFactory: async (config) => ({
        default: 'main',
        connections: [
          {
            name: 'main',
            schema: mainSchema,
            dialect: () => new PostgresDialect({
              pool: new Pool({ connectionString: config.get('DATABASE_URL') }),
            }),
          },
        ],
      }),
    }),
  ],
})
export class AppModule {}
```

## DatabaseService Type

Type alias for the ZenStack ORM client contract:

```typescript
type DatabaseService<
  K extends ConnectionName = DefaultConnectionName,
  Schema extends InferConnectionSchema<K> = InferConnectionSchema<K>,
> = ClientContract<Schema, ClientOptions<Schema>>
```

### Default Connection

```typescript
import { DI_TOKENS, inject } from 'stratal/di'
import { type DatabaseService } from '@stratal/framework/database'

@Transient()
export class UserService {
  constructor(@inject(DI_TOKENS.Database) private readonly db: DatabaseService) {}

  async findAll() {
    return this.db.user.findMany()
  }
}
```

### Named Connection

```typescript
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

@Transient()
export class AnalyticsService {
  constructor(@InjectDB('analytics') private readonly db: DatabaseService<'analytics'>) {}
}
```

## @InjectDB Decorator

```typescript
function InjectDB(name: ConnectionName): ParameterDecorator
```

Shorthand for `inject(connectionSymbol(name))`. Use for named connections instead of manual symbol lookup.

## Schema Augmentation

For type-safe database access, augment these interfaces:

```typescript
declare module '@stratal/framework/database' {
  interface DatabaseSchemaRegistry {
    main: typeof mainSchema
    analytics: typeof analyticsSchema
  }

  interface DefaultDatabaseConnection {
    name: 'main'
  }
}
```

### Type Helpers

| Type | Description |
|------|-------------|
| `ConnectionName` | Union of registered connection names (falls back to `string`) |
| `DefaultConnectionName` | Default connection name from augmentation (falls back to `string`) |
| `InferConnectionSchema<K>` | Resolves schema type for connection `K` |
| `InferDatabaseSchema` | Union of all registered schemas |

## Database Plugins

| Plugin | ID | Auto-registered | Purpose |
|--------|----|-----------------|---------|
| `ErrorHandlerPlugin` | `error-handler` | Yes (first) | Maps ZenStack `ORMError` to `DatabaseError` subclasses |
| `EventEmitterPlugin` | `event-emitter` | Yes (second) | Emits before/after events per operation |
| `SchemaSwitcherPlugin` | `schema-switcher` | No (manual) | Multi-tenant PostgreSQL schema isolation |

### SchemaSwitcherPlugin

For multi-tenant schema switching:

```typescript
import { SchemaSwitcherPlugin } from '@stratal/framework/database'

const config: DatabaseConnectionConfig = {
  name: 'tenant',
  schema: tenantSchema,
  dialect: () => tenantDialect,
  plugins: [new SchemaSwitcherPlugin({ schemaName: 'tenant_123' })],
}
```

Executes `SET search_path TO "{schemaName}"` before each query.

## Database Events

The `EventEmitterPlugin` emits events for every database operation.

### Event Name Format

```
{phase}.{Model}.{operation}
```

**Phases:** `before`, `after`

**Operations:** `create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `findUnique`, `findFirst`, `findMany`, `upsert`, `count`, `aggregate`, `groupBy`

### Wildcard Patterns

| Pattern | Example | Matches |
|---------|---------|---------|
| `{phase}.{Model}.{op}` | `after.User.create` | Specific model + operation |
| `{phase}.{Model}` | `after.User` | All operations on model |
| `{phase}.{op}` | `before.create` | Operation on all models |
| `{phase}` | `after` | All after events |

### Augmenting Events

```typescript
declare module 'stratal/events' {
  interface CustomEventRegistry extends DatabaseEvents {}
}
```

### Listening Example

Use the class-based `@Listener()` + `@On()` pattern:

```typescript
import { Listener, On, type EventContext } from 'stratal/events'

@Listener()
export class UserEventListener {
  @On('after.User.create')
  async onUserCreated(context: EventContext<'after.User.create'>) {
    console.log('User created:', context.result)
  }

  @On('before.User.delete', { priority: 10, blocking: true })
  async onBeforeUserDelete(context: EventContext<'before.User.delete'>) {
    // Runs before deletion, blocks the operation
  }
}
```

- **`@Listener()`** — marks a class as an event listener (auto-registered as singleton, supports constructor DI)
- **`@On(event, options?)`** — decorates handler methods for specific events
- **`EventOptions`**: `{ priority?: number, blocking?: boolean }` — `priority` controls execution order (higher first, default 0)
- **Default blocking behavior**: `before.*` events are blocking (awaited), `after.*` events are non-blocking (via `waitUntil`), custom events are blocking
- **Registration**: add listeners as providers in `@Module({ providers: [UserEventListener] })`

## Database Errors

### Error Hierarchy

| Error Class | Code | i18n Key |
|-------------|------|----------|
| `DatabaseError` (base) | 2000 (`DATABASE.GENERIC`) | `errors.databaseGeneric` |
| `RecordNotFoundError` | 2001 (`DATABASE.RECORD_NOT_FOUND`) | `errors.databaseRecordNotFound` |
| `UniqueConstraintError` | 2002 (`DATABASE.UNIQUE_CONSTRAINT`) | `errors.databaseUniqueConstraint` |
| `ForeignKeyConstraintError` | 2003 (`DATABASE.FOREIGN_KEY_CONSTRAINT`) | `errors.databaseForeignKeyConstraint` |
| `DatabaseConfigError` | 2000 (`DATABASE.GENERIC`) | `errors.databaseGeneric` |

All database error codes must be in range 2000-2999 (enforced by `DatabaseError` constructor).

### PostgreSQL Error Code Mapping

The `fromZenStackError()` utility maps PostgreSQL errors:

| PostgreSQL Code | Mapped Error | Framework Code |
|-----------------|-------------|----------------|
| `23505` | `UniqueConstraintError` | 2002 |
| `23503` | `ForeignKeyConstraintError` | 2003 |
| `23502` | `DatabaseError` | 2006 (`NULL_CONSTRAINT`) |
| `23514` | `DatabaseError` | 2000 (check constraint) |
| `42P01` | `DatabaseError` | 2000 (table not found) |
| `42703` | `DatabaseError` | 2000 (column not found) |
| `08***` | `DatabaseError` | 2004 (`CONNECTION_FAILED`) |
| `57014` | `DatabaseError` | 2005 (`TIMEOUT`) |
| `40***` | `DatabaseError` | 2008 (`TRANSACTION_CONFLICT`) |
| `53300` | `DatabaseError` | 2007 (`TOO_MANY_CONNECTIONS`) |

## Custom PostgreSQL Types

For PostgreSQL array parsing (e.g., custom enum arrays):

```typescript
import { customPgTypes } from '@stratal/framework/database'

const pool = new Pool({
  connectionString,
  types: customPgTypes,
})
```

Auto-detects and parses PostgreSQL array literals (`{val1,val2}`) using the `postgres-array` package.

## Tokens

```typescript
import { DATABASE_TOKENS, connectionSymbol } from '@stratal/framework/database'

DATABASE_TOKENS.Options  // Symbol.for('DatabaseModuleOptions')
connectionSymbol('main') // Symbol.for('DatabaseConnection:main')
```

The default connection is also registered at `DI_TOKENS.Database` from `stratal/di`.

## Import Paths

```typescript
// Module and types
import { DatabaseModule, type DatabaseService, type DatabaseModuleConfig } from '@stratal/framework/database'

// Decorator
import { InjectDB } from '@stratal/framework/database'

// Schema augmentation types
import { type DatabaseSchemaRegistry, type DefaultDatabaseConnection } from '@stratal/framework/database'
import { type ConnectionName, type DefaultConnectionName, type InferConnectionSchema } from '@stratal/framework/database'

// Plugins
import { ErrorHandlerPlugin, EventEmitterPlugin, SchemaSwitcherPlugin } from '@stratal/framework/database'

// Errors
import { DatabaseError, RecordNotFoundError, UniqueConstraintError, ForeignKeyConstraintError } from '@stratal/framework/database'
import { fromZenStackError } from '@stratal/framework/database'

// Tokens
import { DATABASE_TOKENS, connectionSymbol } from '@stratal/framework/database'

// Custom types
import { customPgTypes } from '@stratal/framework/database'
```
