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
| simple GET - 200 | 67,656 | ±0.88% | 13.3 µs | 37.6 µs |
| GET with route params - 200 | 56,828 | ±1.38% | 15.8 µs | 63.9 µs |
| POST with JSON body - 201 | 39,253 | ±0.87% | 23.5 µs | 60.0 µs |
| POST invalid body - validation error | 4,159 | ±2.11% | 210 µs | 925 µs |
| GET unknown route - 404 | 8,283 | ±0.94% | 114 µs | 329 µs |

### DI Container

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| register class provider | 2,379,293 | ±5.80% | 0.33 µs | 0.83 µs |
| registerSingleton | 3,007,571 | ±1.65% | 0.29 µs | 0.54 µs |
| resolve class token | 1,706,979 | ±0.72% | 0.54 µs | 0.83 µs |
| resolve singleton token | 1,668,264 | ±0.65% | 0.54 µs | 0.83 µs |
| isRegistered check | 1,961,169 | ±1.63% | 0.46 µs | 1.00 µs |

### Module Registry

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| register single module | 2,215,821 | ±0.97% | 0.42 µs | 0.71 µs |
| register 3-level module tree | 1,250,163 | ±0.79% | 0.71 µs | 1.21 µs |
| initialize with lifecycle hooks | 1,593,072 | ±0.56% | 0.58 µs | 0.88 µs |

### Route Registration

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| controller with 5 OpenAPI routes | 41,520 | ±4.87% | 15.7 µs | 50.1 µs |
| single-route controller | 198,949 | ±3.75% | 3.54 µs | 8.25 µs |

### Application

| Benchmark | ops/sec | ±% | Median | P99 |
|---|--:|--:|--:|--:|
| constructor only | 349,958 | ±1.69% | 2.46 µs | 6.00 µs |
| full initialize() | 43,988 | ±6.88% | 14.0 µs | 69.5 µs |
| resolve service after bootstrap | 47,981 | ±5.54% | 14.0 µs | 41.8 µs |

> Benchmarks run on: Apple M3 Max (16-core), 48 GB RAM, macOS 26.2, Node.js v22.12.0

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
