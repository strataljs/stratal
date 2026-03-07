# @stratal/framework

Authentication, database ORM, RBAC, guards, and test factories for [Stratal](https://github.com/strataljs/stratal) applications.

[![npm version](https://img.shields.io/npm/v/@stratal/framework)](https://www.npmjs.com/package/@stratal/framework)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/strataljs/stratal/badge)](https://securityscorecards.dev/viewer/?uri=github.com/strataljs/stratal)
[![Known Vulnerabilities](https://snyk.io/test/github/strataljs/stratal/badge.svg)](https://snyk.io/test/github/strataljs/stratal)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/framework)](https://www.npmjs.com/package/@stratal/framework)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@stratal/framework)](https://bundlephobia.com/package/@stratal/framework)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## Modules

- **AuthModule** — Better Auth integration with session management and middleware
- **DatabaseModule** — ZenStack ORM with support for multiple named connections
- **RbacModule** — Casbin-based role-based access control with ZenStack policy adapter
- **AuthGuard** — Authentication and scoped authorization guard for route protection
- **AuthContext** — Request-scoped user context for accessing the authenticated user
- **Factory** — Test data factories with sequenced attributes powered by Faker.js

## Installation

```bash
npm install @stratal/framework
# or
yarn add @stratal/framework
```

### Peer dependencies

| Package | Required |
|---|---|
| `stratal` | Yes |
| `@zenstackhq/orm` | Yes |
| `pg` | Yes |
| `better-auth` | No — needed for `AuthModule` |
| `@better-auth/core` | No — needed for `AuthModule` |
| `@zenstackhq/better-auth` | No — needed for `AuthModule` |
| `casbin` | No — needed for `RbacModule` |
| `@faker-js/faker` | No — needed for `Factory` |

### AI Agent Skills

Stratal provides [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code and Cursor. Install to give your AI agent knowledge of Stratal patterns, conventions, and APIs:

```bash
npx skills add strataljs/stratal
```

## Quick Start

```typescript
import { Stratal } from 'stratal'
import { Module } from 'stratal/module'
import { AuthModule } from '@stratal/framework/auth'
import { DatabaseModule } from '@stratal/framework/database'
import { RbacModule } from '@stratal/framework/rbac'

@Module({
  imports: [
    DatabaseModule.forRoot({
      connections: [{ name: 'default', connectionString: 'DATABASE_URL' }],
    }),
    AuthModule.forRoot(),
    RbacModule.forRoot({ model: MODEL }),
  ],
})
class AppModule {}

export default new Stratal({ module: AppModule })
```

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**.

## License

MIT
