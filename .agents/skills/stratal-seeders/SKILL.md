---
name: stratal-seeders
description: >-
  Use when working with database seeders in Stratal — writing seeders, CLI usage,
  and seeder registration. Trigger on: seeder, seed, Seeder, stratal-seed,
  SeederRunner, @stratal/seeders.
user-invocable: false
license: MIT
metadata:
  author: Temitayo Fadojutimi
  version: "2.0"
---

# @stratal/seeders

CLI tool and infrastructure for database seeding in Stratal applications. Seeders run within request-scoped DI containers with full access to injected services. Full documentation at [stratal.dev/testing/seeders](https://stratal.dev/testing/seeders).

## Writing a Seeder

```ts
import { Seeder } from '@stratal/seeders';
import { inject, Transient, DI_TOKENS } from 'stratal/di';
import type { DatabaseService } from '@stratal/framework/database';

@Transient()
export class UserSeeder extends Seeder {
  constructor(@inject(DI_TOKENS.Database) private db: DatabaseService) {
    super();
  }

  async run() {
    await new UserFactory().count(10).createMany(this.db);
  }
}
```

## Registration

Register seeders in module `providers`:

```ts
@Module({
  providers: [UserSeeder, RolePermissionsSeeder],
})
export class SeederModule {}
```

Seeders are auto-discovered by walking module `providers` recursively — any class extending `Seeder` is found.

## Entry File

```ts
// src/seed.ts
import { SeederRunner } from '@stratal/seeders';
import { AppModule } from './app.module';

SeederRunner.run(AppModule);
```

Add to `package.json`: `"seed": "stratal-seed"` (uses `@swc-node/register` for runtime TypeScript support).

## CLI Usage

| Command | Description |
|---|---|
| `npx stratal-seed run <seeder>` | Run a single seeder by name |
| `npx stratal-seed run --all` | Run all discovered seeders |
| `npx stratal-seed list` | List all available seeders |
| `npx stratal-seed run <seeder> --dry-run` | Preview without executing |

## Naming Convention

| Class Name | CLI Name |
|---|---|
| `UserSeeder` | `user` |
| `RolePermissionsSeeder` | `role-permissions` |
| `OrganizationMembersSeeder` | `organization-members` |

Pattern: strip `Seeder` suffix, convert PascalCase to kebab-case.
