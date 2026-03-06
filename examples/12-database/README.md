# 12 - Database

ZenStack ORM with PostgreSQL via Hyperdrive and database event listeners.

## What it demonstrates

- `DatabaseModule.forRootAsync({ inject, useFactory })` for configuring database connections
- `@InjectDB('main')` decorator for typed database injection
- `DatabaseSchemaRegistry` and `DefaultDatabaseConnection` module augmentation for strict typing
- ZenStack v3 schema definition (`db/schema.zmodel`) with PostgreSQL provider
- Database event listeners (`after.Task.create`, `after.Task.update`, `after.Task.delete`) via `EventEmitterPlugin`
- `PostgresDialect` with Hyperdrive binding for Cloudflare Workers
- `zen db push` for schema management (no manual migrations)
- `StratalEnv extends Cloudflare.Env` for auto-generated environment types

## Prerequisites

1. Install [Docker](https://www.docker.com/) (for PostgreSQL).

2. Start the database:

```bash
cd examples/12-database
npm run db:up
```

3. Install dependencies and generate types:

```bash
npm install
npm run generate
npm run wrangler:types
```

4. Push the schema to create tables:

```bash
npm run db:push
```

## Running

```bash
cd examples/12-database
npx wrangler dev
```

## API endpoints

| Method | Path             | Description            |
|--------|------------------|------------------------|
| GET    | /api/tasks       | List all tasks         |
| POST   | /api/tasks       | Create a task          |
| GET    | /api/tasks/:id   | Get a task             |
| PUT    | /api/tasks/:id   | Update a task          |
| DELETE | /api/tasks/:id   | Delete a task          |

## Example requests

```bash
# Create a task
curl -X POST http://localhost:8787/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Learn Stratal", "description": "Build a Workers app"}'

# List all tasks
curl http://localhost:8787/api/tasks

# Mark a task as completed
curl -X PUT http://localhost:8787/api/tasks/<id> \
  -H 'Content-Type: application/json' \
  -d '{"completed": true}'

# Delete a task
curl -X DELETE http://localhost:8787/api/tasks/<id>
```

Watch the wrangler console to see `[TaskListener]` log output from the database event listeners.

## Key files

- [`docker-compose.yml`](docker-compose.yml) - PostgreSQL 16 Alpine container
- [`db/schema.zmodel`](db/schema.zmodel) - ZenStack v3 schema defining the `Task` model (PostgreSQL)
- [`src/database/database.types.ts`](src/database/database.types.ts) - `DatabaseSchemaRegistry` and `DefaultDatabaseConnection` augmentation
- [`src/database/database.config.ts`](src/database/database.config.ts) - Database connection factory with PostgresDialect + Hyperdrive
- [`src/tasks/tasks.controller.ts`](src/tasks/tasks.controller.ts) - CRUD controller using `@InjectDB('main')`
- [`src/listeners/task.listener.ts`](src/listeners/task.listener.ts) - Database event listener for task operations
- [`src/types/env.ts`](src/types/env.ts) - `StratalEnv extends Cloudflare.Env` augmentation
