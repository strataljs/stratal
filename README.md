# Stratal

<p align="center">
  <img src="media/banner.png" alt="Stratal" width="600" />
</p>

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

## Features

- **Dependency Injection** - Two-tier DI container (global + request-scoped) powered by tsyringe
- **OpenAPI Documentation** - Define Zod schemas once and get a full OpenAPI 3.0 spec with interactive docs
- **Modular Architecture** - NestJS-style modules with lifecycle hooks, dynamic configuration, and middleware
- **Hono Routing** - Convention-based RESTful controllers with automatic HTTP method mapping
- **Queue Consumers** - Typed Cloudflare Queue consumers with message-type filtering
- **Cron Jobs** - Scheduled tasks via Cloudflare Workers cron triggers
- **Storage** - S3-compatible file storage with presigned URLs and TUS upload support
- **Email** - Resend and SMTP providers with React Email template support
- **i18n** - Type-safe internationalization with locale detection from request headers
- **Guards and Middleware** - Route protection and per-module middleware configuration

> **Note:** Stratal is in active development and APIs may change before v1. It is okay to use in projects, but consider pinning your dependency version so that a new patch does not break your existing code.

## Installation

```bash
npm install stratal
# or
yarn add stratal
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

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**. API reference lives at **[api-reference.stratal.dev](https://api-reference.stratal.dev)**.

## Benchmarks

### Request / Response (e2e)

Full request lifecycle: DI resolution → middleware → routing → validation → response serialization.

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| simple GET - 200 | 75,043 | ±0.54% | 13.3 µs | 22.8 µs |
| GET with route params - 200 | 66,872 | ±0.38% | 15.0 µs | 19.7 µs |
| POST with JSON body - 201 | 41,461 | ±0.54% | 24.1 µs | 35.1 µs |
| POST invalid body - validation error | 20,164 | ±3.40% | 49.6 µs | 111 µs |
| GET unknown route - 404 | 36,809 | ±0.71% | 27.2 µs | 40.4 µs |

### DI Container

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| register class provider | 3,201,646 | ±1.42% | 0.31 µs | 0.54 µs |
| registerSingleton | 3,234,158 | ±1.25% | 0.31 µs | 0.46 µs |
| resolve class token | 1,798,438 | ±0.48% | 0.56 µs | 0.75 µs |
| resolve singleton token | 1,696,615 | ±1.50% | 0.59 µs | 0.83 µs |
| isRegistered check | 2,107,301 | ±0.62% | 0.47 µs | 0.67 µs |

### Module Registry

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| register single module | 2,305,528 | ±0.77% | 0.43 µs | 0.58 µs |
| register 3-level module tree | 1,308,145 | ±0.49% | 0.76 µs | 1.00 µs |
| initialize with lifecycle hooks | 1,624,482 | ±0.47% | 0.62 µs | 0.79 µs |

### Route Registration

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| controller with 5 OpenAPI routes | 45,595 | ±4.10% | 21.9 µs | 42.2 µs |
| single-route controller | 209,296 | ±3.43% | 4.78 µs | 7.83 µs |

### Application

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| constructor only | 362,866 | ±1.45% | 2.76 µs | 5.71 µs |
| full initialize() | 50,679 | ±5.27% | 19.7 µs | 39.8 µs |
| resolve service after bootstrap | 48,779 | ±5.38% | 20.5 µs | 39.4 µs |

> Benchmarks ran on: Apple M3 Max (16-core), 48 GB RAM, macOS 26.2, Node.js v22.12.0

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
