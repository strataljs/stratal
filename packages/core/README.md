# Stratal

A modular framework for building Cloudflare Workers with dependency injection, OpenAPI documentation, queues, cron jobs, and more.

[![npm version](https://img.shields.io/npm/v/stratal)](https://www.npmjs.com/package/stratal)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![Benchmark](https://github.com/strataljs/stratal/actions/workflows/benchmark.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/benchmark.yml)
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

- **Dependency Injection** — Two-tier DI container (global + request-scoped) powered by tsyringe
- **OpenAPI Documentation** — Define Zod schemas once and get a full OpenAPI 3.0 spec with interactive docs
- **Modular Architecture** — NestJS-style modules with lifecycle hooks, dynamic configuration, and middleware
- **Hono Routing** — Convention-based RESTful controllers with automatic HTTP method mapping
- **Queue Consumers** — Typed Cloudflare Queue consumers with message-type filtering
- **Cron Jobs** — Scheduled tasks via Cloudflare Workers cron triggers
- **Storage** — S3-compatible file storage with presigned URLs and TUS upload support
- **Email** — Resend and SMTP providers with React Email template support
- **i18n** — Type-safe internationalization with locale detection from request headers
- **Guards and Middleware** — Route protection and per-module middleware configuration

> **Note:** Stratal is in active development and APIs may change before v1. It is okay to use in projects, but consider pinning your dependency version so that a new patch does not break your existing code.

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
| `hello-world` | A minimal Stratal app with a single GET endpoint | [Source](https://github.com/strataljs/stratal/tree/main/examples/01-hello-world) |
| `crud-api` | RESTful notes API with full CRUD operations and DI | [Source](https://github.com/strataljs/stratal/tree/main/examples/02-crud-api) |
| `testing` | Vitest + @stratal/testing with Cloudflare worker pool | [Source](https://github.com/strataljs/stratal/tree/main/examples/03-testing) |
| `guards` | Route protection with @UseGuards and CanActivate | [Source](https://github.com/strataljs/stratal/tree/main/examples/04-guards) |
| `middleware` | Middleware configuration with apply/exclude/forRoutes | [Source](https://github.com/strataljs/stratal/tree/main/examples/05-middleware) |
| `queues` | Queue producer/consumer pattern with Cloudflare Queues | [Source](https://github.com/strataljs/stratal/tree/main/examples/06-queues) |
| `scheduled-tasks` | Cron job scheduling with the CronJob interface | [Source](https://github.com/strataljs/stratal/tree/main/examples/07-scheduled-tasks) |
| `openapi` | OpenAPI docs with Scalar UI and Zod schema integration | [Source](https://github.com/strataljs/stratal/tree/main/examples/08-openapi) |

For benchmarks, see the [main README](https://github.com/strataljs/stratal#benchmarks).

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

## Quick Start

Define a module with a controller and wire it up as a Cloudflare Worker:

```typescript
import { type ApplicationConfig } from 'stratal'
import { Module } from 'stratal/module'
import { Controller, Route, type RouterContext } from 'stratal/router'
import { StratalWorker } from 'stratal/worker'
import { z } from 'stratal/validation'

// Define a controller
@Controller('/api/greetings')
class GreetingsController {
  @Route({
    summary: 'Say hello',
    response: z.object({ message: z.string() }),
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
export default class Backend extends StratalWorker {
  protected configure(): ApplicationConfig {
    return { module: AppModule }
  }
}
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](https://github.com/strataljs/stratal/blob/main/CONTRIBUTING.md) for guidelines.

## License

MIT
