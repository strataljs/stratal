# @stratal/zenstack-plugin

ZenStack plugin for multi-connection database support in [Stratal](https://github.com/strataljs/stratal) framework applications.

[![npm version](https://img.shields.io/npm/v/@stratal/zenstack-plugin)](https://www.npmjs.com/package/@stratal/zenstack-plugin)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/strataljs/stratal/badge)](https://securityscorecards.dev/viewer/?uri=github.com/strataljs/stratal)
[![Known Vulnerabilities](https://snyk.io/test/github/strataljs/stratal/badge.svg)](https://snyk.io/test/github/strataljs/stratal)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/zenstack-plugin)](https://www.npmjs.com/package/@stratal/zenstack-plugin)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@stratal/zenstack-plugin)](https://bundlephobia.com/package/@stratal/zenstack-plugin)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## Features

- **Multi-Connection Support** — Assign models to named database connections via the `@@connection` attribute
- **Auto-Generated Slicing Config** — Produces a type-safe `slicing.ts` with connection names and per-connection model lists
- **Per-Connection Migration Schemas** — Generates standalone `schema.zmodel` files for each connection
- **Type Augmentation** — Automatically augments the `StratalDatabase` interface for type-safe database access
- **Cross-Connection Relation Validation** — Detects and warns about relations spanning different connections
- **CLI for Migrations** — `stratal-db` CLI wraps ZenStack migrate and push commands per connection

## Installation

```bash
npm install -D @stratal/zenstack-plugin
# or
yarn add -D @stratal/zenstack-plugin
```

### Peer dependencies

| Package | Required |
|---|---|
| `@zenstackhq/language` | Yes |
| `@zenstackhq/sdk` | Yes |

### AI Agent Skills

Stratal provides [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code and Cursor. Install to give your AI agent knowledge of Stratal patterns, conventions, and APIs:

```bash
npx skills add strataljs/stratal
```

## Quick Start

Configure the plugin in your `schema.zmodel`:

```zmodel
plugin stratal {
  provider = "@stratal/zenstack-plugin"
  output   = "./src/generated"
  default  = "main"
}

model User {
  id    Int    @id @default(autoincrement())
  name  String
  email String @unique

  @@connection("main")
}

model Event {
  id        Int      @id @default(autoincrement())
  name      String
  timestamp DateTime

  @@connection("analytics")
}
```

Running `zenstack generate` will produce:

- `src/generated/slicing.ts` — connection slicing config with `StratalDatabase` type augmentation
- `src/generated/connections/main/schema.zmodel` — schema containing only `main` models
- `src/generated/connections/analytics/schema.zmodel` — schema containing only `analytics` models

## Plugin Options

| Option | Type | Default | Description |
|---|---|---|---|
| `output` | `string` | ZenStack default output path | Directory for generated files (relative to schema) |
| `default` | `string` | `"main"` | Name of the default connection for models without `@@connection` |

## CLI

The `stratal-db` command manages per-connection migrations and schema pushes.

### `stratal-db migrate`

Run ZenStack migrations for one or all connections.

```bash
stratal-db migrate <subcommand> [options]
```

#### Subcommands

| Subcommand | Description |
|---|---|
| `dev` | Create a new migration (development) |
| `deploy` | Apply pending migrations (production) |
| `status` | Show migration status |
| `reset` | Reset the database and re-apply migrations |

#### Options

| Option | Alias | Description |
|---|---|---|
| `--connection <name>` | `-c` | Target a single named connection |
| `--all-connections` | | Run for all discovered connections |
| `--schema <path>` | | Path to the root schema (default: `schema.zmodel`) |
| `--name <name>` | `-n` | Migration name (only for `migrate dev`) |
| `--no-cleanup` | | Keep generated per-connection schema files after execution |

### `stratal-db push`

Push schema changes directly to the database for one or all connections.

```bash
stratal-db push [options]
```

#### Options

| Option | Alias | Description |
|---|---|---|
| `--connection <name>` | `-c` | Target a single named connection |
| `--all-connections` | | Run for all discovered connections |
| `--schema <path>` | | Path to the root schema (default: `schema.zmodel`) |
| `--no-cleanup` | | Keep generated per-connection schema files after execution |

> Both commands require either `--connection <name>` or `--all-connections`.

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**.

## License

MIT
