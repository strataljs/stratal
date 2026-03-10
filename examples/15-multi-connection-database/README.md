# 15 - Multi-Connection Database

Multi-connection database setup with per-connection ZenStack schemas for independent schema management and type-safe access.

## What it demonstrates

- Per-connection `.zmodel` files — each connection has its own schema under `db/{name}/`
- Per-connection `zenstack generate` for independent schema generation
- Manual `StratalDatabase` type augmentation with `schemas` map for per-connection type safety
- Multi-connection `DatabaseModule.forRootAsync()` with per-connection `schema` in connection config
- `@InjectDB('main')` and `@InjectDB('analytics')` for typed access to separate databases
- Cross-connection event listeners: main database events trigger analytics writes

## Prerequisites

1. Install [Docker](https://www.docker.com/) (for PostgreSQL).

2. Start the databases:

```bash
cd examples/15-multi-connection-database
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
npm run db:push:main
npm run db:push:analytics
```

## Running

```bash
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
| GET    | /api/users/:userId/posts  | List posts for a user    |
| POST   | /api/users/:userId/posts  | Create a post for a user |

### Analytics (analytics database)

| Method | Path                          | Description        |
|--------|-------------------------------|--------------------|
| POST   | /api/analytics/page-views     | Record a page view |
| GET    | /api/analytics/page-views     | List page views    |
| POST   | /api/analytics/events         | Record an event    |
| GET    | /api/analytics/events         | List events        |

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

```

Watch the wrangler console to see `[UserAnalyticsListener]` log output from the cross-connection event listeners.

## Key files

- [`docker-compose.yml`](docker-compose.yml) - Two PostgreSQL 16 Alpine containers (main + analytics)
- [`db/main/schema.zmodel`](db/main/schema.zmodel) - Main connection schema (User, Post)
- [`db/analytics/schema.zmodel`](db/analytics/schema.zmodel) - Analytics connection schema (PageView, Event)
- [`src/database/database.config.ts`](src/database/database.config.ts) - Multi-connection config with per-connection schemas
- [`src/database/database.types.ts`](src/database/database.types.ts) - `StratalDatabase` type augmentation with per-connection schemas
- [`src/users/users.controller.ts`](src/users/users.controller.ts) - Users CRUD controller using `@InjectDB('main')`
- [`src/users/user-posts.controller.ts`](src/users/user-posts.controller.ts) - Nested user posts controller using `@InjectDB('main')`
- [`src/analytics/page-views.controller.ts`](src/analytics/page-views.controller.ts) - Page views controller using `@InjectDB('analytics')`
- [`src/analytics/events.controller.ts`](src/analytics/events.controller.ts) - Events controller using `@InjectDB('analytics')`
- [`src/listeners/user-analytics.listener.ts`](src/listeners/user-analytics.listener.ts) - Cross-connection event listener
- [`src/types/env.ts`](src/types/env.ts) - `StratalEnv extends Cloudflare.Env` augmentation
