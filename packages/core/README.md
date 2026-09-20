# Stratal

A modular framework for building Cloudflare Workers with dependency injection, OpenAPI documentation, queues, cron jobs, and more.

[![npm version](https://img.shields.io/npm/v/stratal)](https://www.npmjs.com/package/stratal)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/strataljs/stratal/badge)](https://securityscorecards.dev/viewer/?uri=github.com/strataljs/stratal)
[![Known Vulnerabilities](https://snyk.io/test/github/strataljs/stratal/badge.svg)](https://snyk.io/test/github/strataljs/stratal)
[![npm downloads](https://img.shields.io/npm/dm/stratal)](https://www.npmjs.com/package/stratal)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/stratal)](https://bundlephobia.com/package/stratal)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**. API reference lives at **[api-reference.stratal.dev](https://api-reference.stratal.dev)**.

## Features

- **Dependency Injection** — Two-tier DI container (global + request-scoped) with decorator-based injection
- **Modular Architecture** — NestJS-style modules with lifecycle hooks, dynamic configuration, and lazy loading
- **Routing** — Convention-based RESTful controllers on Hono, plus explicit method decorators, named routes, versioning, and domain routing
- **OpenAPI Documentation** — Define Zod schemas once and get an OpenAPI 3.0 spec with Swagger UI
- **Queues and Cron** — Typed Cloudflare Queue consumers with message-type filtering, and scheduled jobs via cron triggers
- **Events** — In-process and queue-backed event listeners with `@Listener` / `@On`
- **WebSockets and SSE** — Gateway classes with `@OnMessage` / `@OnClose` / `@OnError`, and server-sent event streams
- **Caching** — KV-backed cache with optional isolate-level L1 tiering, plus `@Cacheable` / `@PurgesCache` response caching on the Workers Cache API
- **Rate Limiting** — Declarative `@RateLimit` with named limiters
- **Storage** — Cloudflare R2 file storage with presigned URLs and resumable multipart uploads (TUS-compatible)
- **Email** — SMTP provider with React Email template support and queued delivery
- **i18n** — Type-safe internationalization with locale detection from request headers
- **Configuration** — Namespaced, validated config with typed dot-path access
- **Guards and Middleware** — Route protection and per-module middleware configuration
- **Seeders** — Ordered database seeders with `db:seed` commands
- **Quarry CLI** — Built-in commands for routes, queues, events, i18n and schedules — and `mcp:serve`, which exposes your API routes to an AI agent as MCP tools

## Requirements

- Node.js ≥ 22
- A Cloudflare Workers project

## Installation

Scaffold a new project from an official template:

```bash
npm create stratal my-app
# or
yarn create stratal my-app
# or
pnpm create stratal my-app
```

Available templates:

| Template | Description | Example |
|---|---|---|
| `hello-world` | A minimal Stratal app with a single GET endpoint | [Source](https://github.com/strataljs/examples/tree/main/01-hello-world) |
| `crud-api` | RESTful notes API with full CRUD operations and DI | [Source](https://github.com/strataljs/examples/tree/main/02-crud-api) |
| `testing` | Vitest + @stratal/testing with Cloudflare worker pool | [Source](https://github.com/strataljs/examples/tree/main/03-testing) |
| `guards` | Route protection with @UseGuards and CanActivate | [Source](https://github.com/strataljs/examples/tree/main/04-guards) |
| `middleware` | Middleware configuration with apply/exclude/forRoutes | [Source](https://github.com/strataljs/examples/tree/main/05-middleware) |
| `queues` | Queue producer/consumer pattern with Cloudflare Queues | [Source](https://github.com/strataljs/examples/tree/main/06-queues) |
| `scheduled-tasks` | Cron job scheduling with the CronJob interface | [Source](https://github.com/strataljs/examples/tree/main/07-scheduled-tasks) |
| `openapi` | OpenAPI docs with Swagger UI and Zod schema integration | [Source](https://github.com/strataljs/examples/tree/main/08-openapi) |

More runnable examples — seeders, events, auth, database, access control, factories, Workers bindings, commands and Inertia — live at [strataljs/examples](https://github.com/strataljs/examples).

You can also specify a template directly:

```bash
npm create stratal my-app -- -t crud-api
```

Or add Stratal to an existing project:

```bash
npm install stratal
```

### AI Agent Skills

Stratal provides [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code and Cursor. Install to give your AI agent knowledge of Stratal patterns, conventions, and APIs:

```bash
npx skills add strataljs/stratal
```

| Skill | Description |
|---|---|
| `stratal` | Build Cloudflare Workers apps with the Stratal framework — modules, DI, controllers, routing, OpenAPI, queues, cron, events, seeders, CLI, auth, database, access control, testing, and more |

## Quick Start

Define a module with a controller and wire it up as a Cloudflare Worker:

```typescript
import { Stratal } from 'stratal'
import { Module } from 'stratal/module'
import { Controller, Route, type RouterContext } from 'stratal/router'
import { object, string } from 'zod/mini'

// Define a controller
@Controller('/api/greetings')
class GreetingsController {
  @Route({
    summary: 'Say hello',
    response: object({ message: string() }),
  })
  async index(ctx: RouterContext) {
    return ctx.json({ message: 'Hello from Stratal!' })
  }
}

// Create the root module
@Module({
  controllers: [GreetingsController],
})
class AppModule {}

// Worker entry point
export default new Stratal({ module: AppModule })
```

### Routing conventions

`@Route()` derives the HTTP method, path and status code from the method name:

| Method | HTTP | Path | Status |
|---|---|---|---|
| `index()` | GET | `/base-path` | 200 |
| `show()` | GET | `/base-path/:id` | 200 |
| `create()` | POST | `/base-path` | 201 |
| `update()` | PUT | `/base-path/:id` | 200 |
| `patch()` | PATCH | `/base-path/:id` | 200 |
| `destroy()` | DELETE | `/base-path/:id` | 200 |

When the convention doesn't fit, use the explicit decorators instead — `@Get()`, `@Post()`, `@Put()`, `@Patch()`, `@Delete()`, `@All()`. A controller uses one style or the other, not both.

```typescript
import { Controller, Get, Post, type RouterContext } from 'stratal/router'
import { object, string, uuid } from 'zod/mini'

@Controller('/notes', { tags: ['Notes'], version: '1' })
export class NotesController {
  @Get('/:id', { params: object({ id: uuid() }), response: noteSchema })
  async getNote(ctx: RouterContext) {
    return ctx.json(await this.notes.find(ctx.param('id')))
  }

  @Post('/', { body: createNoteSchema, response: noteSchema, statusCode: 201 })
  async createNote(ctx: RouterContext) {
    return ctx.json(await this.notes.create(await ctx.body()), 201)
  }
}
```

### Versioning

Don't hard-code the version into the path. Configure it once and the router builds the prefixed paths for you:

```typescript
export default new Stratal({
  module: AppModule,
  versioning: { prefix: 'api/v', defaultVersion: '1' },
})
```

```typescript
@Controller('/notes', { version: '1' })              // → /api/v1/notes
@Controller('/notes', { version: ['1', '2'] })       // → /api/v1/notes and /api/v2/notes
@Controller('/health', { version: VERSION_NEUTRAL }) // → /health, unprefixed
```

A controller with no `version` picks up `defaultVersion`. `router.version('2')` in a module's `configureRoutes()` applies a version to every controller in that module.

### Validation

Schemas come from `zod/mini` directly — named imports keep them tree-shakeable. `stratal/validation` adds the framework's own helpers on top (schema metadata, localized error messages, and shared types):

```typescript
import { describe, named, cuid2 } from 'stratal/validation'
import { object, string } from 'zod/mini'

const noteSchema = named(object({
  id: cuid2(),
  title: describe(string(), 'Note title'),
}), 'Note')
```

## Support the project

If Stratal is useful to you, **[star the repository](https://github.com/strataljs/stratal)** — it is the simplest way to help others find it.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](https://github.com/strataljs/stratal/blob/main/CONTRIBUTING.md) for guidelines.

## Maintainer

Built and maintained by **Temitayo Fadojutimi** — [@adesege_](https://x.com/adesege_).

## License

MIT
