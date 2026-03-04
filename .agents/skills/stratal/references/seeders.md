# Seeders

## Setup

Install as a dev dependency:

```bash
yarn add -D @stratal/seeders
```

Requires `stratal` as a peer dependency.

Binary: `stratal-seed` (available via `npx stratal-seed` or package.json scripts).

## Seeder Class

```typescript
import { Seeder } from '@stratal/seeders'

export abstract class Seeder {
  abstract run(): Promise<void>
}
```

Seeders extend this class and implement `run()`:

```typescript
import { Seeder } from '@stratal/seeders'
import { inject } from 'stratal/di'
import { DI_TOKENS } from 'stratal/di'
import { type DatabaseService } from '@stratal/framework/database'
import { UserFactory } from '../factories/user.factory'

export class UserSeeder extends Seeder {
  constructor(
    @inject(DI_TOKENS.Database) private readonly db: DatabaseService,
  ) {
    super()
  }

  async run(): Promise<void> {
    await new UserFactory().count(10).createMany(this.db)
  }
}
```

## SeederRunner

Entry point for CLI execution:

```typescript
import { SeederRunner } from '@stratal/seeders'

SeederRunner.run(AppModule)
```

### Signature

```typescript
class SeederRunner {
  static run(module: Constructor): void
}
```

- `module` — root Stratal module class containing seeder providers (directly or via imports)
- Internally discovers seeders, sets up yargs CLI, and handles execution

## Entry File Pattern

Create a seed entry file (e.g., `src/seeders/index.ts`):

```typescript
import { SeederRunner } from '@stratal/seeders'
import { AppModule } from '../app.module'

SeederRunner.run(AppModule)
```

## CLI Commands

```bash
stratal-seed <entry-file> <command> [options]
```

| Command | Description |
|---------|-------------|
| `run <seeder>` | Run a specific seeder by name |
| `run --all` | Run all discovered seeders |
| `list` | List all available seeders |

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--all` | `-a` | Run all seeders |
| `--dry-run` | `-d` | Preview without executing |

### Examples

```bash
# Run specific seeder
npx stratal-seed ./src/seeders/index.ts run user

# Run all seeders
npx stratal-seed ./src/seeders/index.ts run --all

# Dry run
npx stratal-seed ./src/seeders/index.ts run user --dry-run

# List available seeders
npx stratal-seed ./src/seeders/index.ts list
```

## Seeder Discovery

Seeders are discovered by walking the module tree recursively. Only **bare class providers** extending `Seeder` are collected — value, factory, and existing providers are ignored.

### Name Derivation

Class names are converted to kebab-case with the `Seeder` suffix stripped:

| Class Name | Seeder Name |
|------------|-------------|
| `UserSeeder` | `user` |
| `RolePermissionsSeeder` | `role-permissions` |
| `DatabaseSeeder` | `database` |

## Execution

Each seeder runs in a request-scoped DI context:

1. Application loads via `wrangler getPlatformProxy()` for env bindings
2. A mock router context is created for request-scoped services
3. Seeder class is resolved via DI container (supports constructor injection)
4. `seeder.run()` is called within the request scope

**Dry-run mode** logs the seeder name and skips execution.

## Registering Seeders

Register seeders as bare class providers in a module:

```typescript
import { Module } from 'stratal/module'
import { UserSeeder } from './user.seeder'
import { RolePermissionsSeeder } from './role-permissions.seeder'

@Module({
  providers: [UserSeeder, RolePermissionsSeeder],
})
export class SeedersModule {}
```

Then import `SeedersModule` in your root module or pass it directly to `SeederRunner.run()`.

## package.json Scripts

```json
{
  "scripts": {
    "seed": "stratal-seed ./src/seeders/index.ts run",
    "seed:all": "stratal-seed ./src/seeders/index.ts run --all",
    "seed:list": "stratal-seed ./src/seeders/index.ts list"
  }
}
```

Usage:

```bash
yarn seed user
yarn seed:all
yarn seed:list
```

## Import Path

```typescript
import { Seeder, SeederRunner } from '@stratal/seeders'
```
