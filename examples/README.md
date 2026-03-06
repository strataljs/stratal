# Stratal Examples

A collection of focused examples demonstrating individual Stratal features. Each example is a standalone Cloudflare Worker project.

## Getting started

Each example is a self-contained project. Install dependencies and run from within the example directory:

```bash
cd examples/01-hello-world
npm install
npx wrangler dev
```

## Examples

| #  | Name | Description |
|----|------|-------------|
| 01 | [hello-world](01-hello-world/) | Simplest possible API — one controller, one GET endpoint |
| 02 | [crud-api](02-crud-api/) | RESTful API with Zod validation, multiple routes, and a service layer |
| 03 | [testing](03-testing/) | Testing with `@stratal/testing`, Vitest, and HTTP assertions |
| 04 | [guards](04-guards/) | Route protection using `@UseGuards` and `CanActivate` |
| 05 | [middleware](05-middleware/) | Middleware configuration with `MiddlewareConfigurable` |
| 06 | [queues](06-queues/) | Queue producer/consumer pattern with Cloudflare Queues |
| 07 | [scheduled-tasks](07-scheduled-tasks/) | Cron job scheduling with the `CronJob` interface |
| 08 | [openapi](08-openapi/) | OpenAPI documentation with Scalar UI |
| 09 | [seeders](09-seeders/) | Database seeding with `@stratal/seeders` and the `stratal-seed` CLI |
| 10 | [events](10-events/) | Type-safe event system with `@Listener` and `@On` decorators |
| 11 | [auth](11-auth/) | Session-based authentication with Better Auth and `AuthGuard` |
| 12 | [database](12-database/) | ZenStack ORM with Hyperdrive and database event listeners |
| 13 | [rbac](13-rbac/) | Role-based access control with Casbin, Auth, and Database integration |
| 14 | [factories](14-factories/) | Test data factories with Faker.js, state modifiers, and `Sequence` |

## Shared patterns

Every example follows the same structure:

```
examples/XX-name/
  src/
    index.ts          # StratalWorker entry point
    app.module.ts     # Root module
    ...               # Feature modules, controllers, services
  package.json        # Standalone package
  tsconfig.json       # TypeScript config with decorator support
  wrangler.jsonc      # Cloudflare Worker configuration
  README.md           # What it demonstrates + how to run
```
