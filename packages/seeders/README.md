# @stratal/seeders

Database seeder infrastructure for [Stratal](https://github.com/strataljs/stratal) framework applications.

[![npm version](https://img.shields.io/npm/v/@stratal/seeders)](https://www.npmjs.com/package/@stratal/seeders)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/strataljs/stratal/badge)](https://securityscorecards.dev/viewer/?uri=github.com/strataljs/stratal)
[![Known Vulnerabilities](https://snyk.io/test/github/strataljs/stratal/badge.svg)](https://snyk.io/test/github/strataljs/stratal)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/seeders)](https://www.npmjs.com/package/@stratal/seeders)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@stratal/seeders)](https://bundlephobia.com/package/@stratal/seeders)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## Features

- **Simple API** — Extend the `Seeder` base class and implement `run()`
- **Automatic Discovery** — Recursively traverses your module tree to find all seeders
- **Dry-Run Mode** — Preview which seeders will execute without running them
- **Request-Scoped DI** — Seeders run within a request scope with full access to the DI container
- **Batch Execution** — Run a single seeder by name or all seeders at once
- **CLI-First** — Powered by wrangler platform proxy for Cloudflare Workers integration

## Installation

```bash
npm install -D @stratal/seeders
# or
yarn add -D @stratal/seeders
```

### Peer dependencies

| Package | Required |
|---|---|
| `stratal` | Yes |

### AI Agent Skills

Stratal provides [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code and Cursor. Install to give your AI agent knowledge of Stratal patterns, conventions, and APIs:

```bash
npx skills add strataljs/stratal
```

## Quick Start

Define a seeder by extending the `Seeder` base class:

```typescript
import { Seeder } from '@stratal/seeders'
import { inject } from 'stratal/di'
import { DATABASE_TOKEN } from './tokens'

export class UserSeeder extends Seeder {
  constructor(@inject(DATABASE_TOKEN) private db: Database) {
    super()
  }

  async run(): Promise<void> {
    await this.db.insert('users', { name: 'Alice', email: 'alice@example.com' })
  }
}
```

Register the seeder in a module:

```typescript
import { Module } from 'stratal/module'
import { UserSeeder } from './user.seeder'

@Module({
  providers: [UserSeeder],
})
export class SeedersModule {}
```

Create an entry file that calls `SeederRunner.run()`:

```typescript
import { SeederRunner } from '@stratal/seeders'
import { AppModule } from './app.module'

SeederRunner.run(AppModule)
```

Run your seeders via the CLI:

```bash
stratal-seed ./src/seeders/index.ts run user
```

## CLI

The `stratal-seed` command is the main entry point for running seeders.

```bash
stratal-seed <entry-file> <command> [options]
```

### Commands

| Command | Description |
|---|---|
| `run <name>` | Run a specific seeder by name |
| `run --all` | Run all discovered seeders |
| `list` | List all available seeders |

### Options

| Option | Alias | Description |
|---|---|---|
| `--all` | `-a` | Run all seeders at once |
| `--dry-run` | `-d` | Preview without executing |
| `--help` | `-h` | Display help information |

Seeder names are derived from the class name: `UserSeeder` becomes `user`, `RolePermissionsSeeder` becomes `role-permissions`.

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**.

## License

MIT
