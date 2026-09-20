# Stratal

<p align="center">
  <img src="media/banner.png" alt="Stratal" width="600" />
</p>

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

## Used in production

<p align="center">
  <a href="https://nounstudy.com"><img src="https://nounstudy.com/brand/logo.png" alt="NounStudy" height="36" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://admissio.app"><img src="https://admissio.app/brand/logo.png" alt="Admissio" height="36" /></a>
</p>

## Requirements

- Node.js ≥ 22
- A Cloudflare Workers project

## Getting started

Scaffold a new project from an official template:

```bash
npm create stratal my-app
# or
yarn create stratal my-app
# or
pnpm create stratal my-app
```

Or add Stratal to an existing project:

```bash
npm install stratal
# or
yarn add stratal
```

## Packages

| Package | npm | Description |
|---|---|---|
| `stratal` | [![npm](https://img.shields.io/npm/v/stratal)](https://www.npmjs.com/package/stratal) | Core framework — modules, DI, routing, OpenAPI, queues, cron, events, cache, storage, email, i18n, Quarry CLI |
| `@stratal/framework` | [![npm](https://img.shields.io/npm/v/@stratal/framework)](https://www.npmjs.com/package/@stratal/framework) | Auth (Better Auth), database ORM (ZenStack), access control, guards, factories |
| `@stratal/testing` | [![npm](https://img.shields.io/npm/v/@stratal/testing)](https://www.npmjs.com/package/@stratal/testing) | Testing utilities, HTTP/WebSocket/SSE/CLI clients, mocks, Vitest plugin |
| `@stratal/inertia` | [![npm](https://img.shields.io/npm/v/@stratal/inertia)](https://www.npmjs.com/package/@stratal/inertia) | Inertia.js v3 server adapter — React SSR on Workers, SEO, partial reloads |
| `@stratal/inertia-modal` | [![npm](https://img.shields.io/npm/v/@stratal/inertia-modal)](https://www.npmjs.com/package/@stratal/inertia-modal) | Backend-driven modal pages built on `@stratal/inertia` |
| `@stratal/feature-flags` | [![npm](https://img.shields.io/npm/v/@stratal/feature-flags)](https://www.npmjs.com/package/@stratal/feature-flags) | Cloudflare Flagship feature flags with Inertia sharing and React hooks |

All packages are versioned together — one release bumps them all.

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

`@Route()` maps method names to HTTP verbs by convention — `index` → `GET /api/greetings`, `show` → `GET /api/greetings/:id`, `create` → `POST` (201), `update` → `PUT`, `patch` → `PATCH`, `destroy` → `DELETE`. Use `@Get()`, `@Post()` and friends when the convention doesn't fit.

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**. API reference lives at **[api-reference.stratal.dev](https://api-reference.stratal.dev)**. Runnable examples live at **[strataljs/examples](https://github.com/strataljs/examples)**.

## Support the project

If Stratal is useful to you, **[star the repository](https://github.com/strataljs/stratal)** — it is the simplest way to help others find it.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Maintainer

Built and maintained by **Temitayo Fadojutimi** — [@adesege_](https://x.com/adesege_).

## License

MIT
