# @stratal/inertia

Inertia.js v3 server adapter for [Stratal](https://github.com/strataljs/stratal) framework — build server-driven React SPAs on Cloudflare Workers.

[![npm version](https://img.shields.io/npm/v/@stratal/inertia)](https://www.npmjs.com/package/@stratal/inertia)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/strataljs/stratal/badge)](https://securityscorecards.dev/viewer/?uri=github.com/strataljs/stratal)
[![Known Vulnerabilities](https://snyk.io/test/github/strataljs/stratal/badge.svg)](https://snyk.io/test/github/strataljs/stratal)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/inertia)](https://www.npmjs.com/package/@stratal/inertia)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@stratal/inertia)](https://bundlephobia.com/package/@stratal/inertia)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## Features

- **InertiaModule** — Drop-in Stratal module with `forRoot()` / `forRootAsync()` configuration
- **Server-Side Rendering** — SSR support with configurable per-route disabling
- **Shared Data** — Global shared props with static values or request-scoped resolvers
- **@InertiaRoute Decorator** — Convention-based Inertia page routes with auto-applied response schema
- **Partial Reloads** — Optional, deferred, and merge props for efficient data loading
- **Quarry CLI Commands** — `inertia:install`, `inertia:dev`, `inertia:build`, and `inertia:types`

## Installation

```bash
npm install @stratal/inertia
# or
yarn add @stratal/inertia
```

### AI Agent Skills

Stratal provides [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code and Cursor. Install to give your AI agent knowledge of Stratal patterns, conventions, and APIs:

```bash
npx skills add strataljs/stratal
```

| Skill | Description |
|---|---|
| `stratal` | Build Cloudflare Workers apps with the Stratal framework — modules, DI, controllers, routing, OpenAPI, queues, cron, events, seeders, CLI, auth, database, RBAC, testing, and more |

## Quick Start

### Module setup

```typescript
import { Stratal } from 'stratal'
import { Module } from 'stratal/module'
import { InertiaModule } from '@stratal/inertia'

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView: 'app',
      entryClientPath: 'src/inertia/app.tsx',
      sharedData: {
        appName: 'My App',
      },
    }),
  ],
})
class AppModule {}

export default new Stratal({ module: AppModule })
```

### Controller with @InertiaRoute

```typescript
import { Controller, type RouterContext } from 'stratal/router'
import { InertiaRoute } from '@stratal/inertia'

@Controller('/notes')
export class NotesController {
  @InertiaRoute({ summary: 'List notes' })
  async index(ctx: RouterContext) {
    return ctx.inertia('notes/Index', { notes: [] })
  }
}
```

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**.

## License

MIT
