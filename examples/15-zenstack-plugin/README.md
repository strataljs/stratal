# 15 - ZenStack Plugin

Multi-connection database with `@stratal/zenstack-plugin` for auto-generated type augmentations, connection slicing, and per-connection schema management.

## What it demonstrates

- `@stratal/zenstack-plugin` for generating connection types, slicing configs, and per-connection migration schemas
- `@@connection("name")` annotations in a single `schema.zmodel` to assign models to different databases
- Auto-generated `database.types.ts` (type augmentation), `slicing.ts` (runtime config), and per-connection schemas
- Multi-connection `DatabaseModule.forRootAsync()` with `connectionSlicing` from generated output
- `@InjectDB('main')` and `@InjectDB('analytics')` for typed access to separate databases
- Cross-connection event listeners: main database events trigger analytics writes
- `stratal-db push` CLI for per-connection schema management

## Prerequisites

1. Install [Docker](https://www.docker.com/) (for PostgreSQL).

2. Start the databases:

```bash
cd examples/15-zenstack-plugin
npm run db:up
```

3. Install dependencies and generate types:

```bash
npm install
npm run generate
npm run wrangler:types
```

4. Push the schema to create tables in both databases:

```bash
npm run db:push:all
```

## Running

```bash
cd examples/15-zenstack-plugin
npx wrangler dev
```

## API endpoints

### Users (main database)

| Method | Path                  | Description              |
|--------|-----------------------|--------------------------|
| GET    | /api/users            | List all users           |
| POST   | /api/users            | Create a user            |
| GET    | /api/users/:id        | Get a user               |
| PUT    | /api/users/:id        | Update a user            |
| DELETE | /api/users/:id        | Delete a user            |
| GET    | /api/users/:id/posts  | List posts for a user    |
| POST   | /api/users/:id/posts  | Create a post for a user |

### Analytics (analytics database)

| Method | Path                          | Description        |
|--------|-------------------------------|--------------------|
| POST   | /api/analytics/page-views     | Record a page view |
| GET    | /api/analytics/page-views     | List page views    |
| POST   | /api/analytics/events         | Record an event    |
| GET    | /api/analytics/events         | List events        |
| GET    | /api/analytics/events/:name/count | Count events by name |

## Example requests

```bash
# Create a user (also triggers a "user.signup" event in analytics DB)
curl -X POST http://localhost:8787/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email": "alice@example.com", "name": "Alice"}'

# Create a post (also triggers a "post.created" event in analytics DB)
curl -X POST http://localhost:8787/api/users/<id>/posts \
  -H 'Content-Type: application/json' \
  -d '{"title": "Hello World", "content": "My first post"}'

# List users
curl http://localhost:8787/api/users

# Record a page view
curl -X POST http://localhost:8787/api/analytics/page-views \
  -H 'Content-Type: application/json' \
  -d '{"path": "/home", "userId": "<id>"}'

# List events (includes auto-recorded signup/post events)
curl http://localhost:8787/api/analytics/events

# Count signup events
curl http://localhost:8787/api/analytics/events/user.signup/count
```

Watch the wrangler console to see `[UserAnalyticsListener]` log output from the cross-connection event listeners.

## Key files

- [`docker-compose.yml`](docker-compose.yml) - Two PostgreSQL 16 Alpine containers (main + analytics)
- [`db/schema.zmodel`](db/schema.zmodel) - Unified schema with `@@connection` annotations and `plugin stratal`
- [`src/database/database.config.ts`](src/database/database.config.ts) - Multi-connection config using generated `connectionSlicing`
- [`src/users/users.controller.ts`](src/users/users.controller.ts) - CRUD controller using `@InjectDB('main')`
- [`src/analytics/analytics.controller.ts`](src/analytics/analytics.controller.ts) - Analytics controller using `@InjectDB('analytics')`
- [`src/listeners/user-analytics.listener.ts`](src/listeners/user-analytics.listener.ts) - Cross-connection event listener
- [`src/types/env.ts`](src/types/env.ts) - `StratalEnv extends Cloudflare.Env` augmentation
