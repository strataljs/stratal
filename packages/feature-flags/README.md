# @stratal/feature-flags

[Cloudflare Flagship](https://developers.cloudflare.com/flagship/) feature flags for the [Stratal](https://stratal.dev) framework, using the native Worker **binding API** — with opt-in [Inertia.js](https://inertiajs.com) sharing and typed React hooks.

[![npm version](https://img.shields.io/npm/v/@stratal/feature-flags)](https://www.npmjs.com/package/@stratal/feature-flags)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/feature-flags)](https://www.npmjs.com/package/@stratal/feature-flags)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## Install

```bash
npm i @stratal/feature-flags
```

Add the Flagship binding to your Wrangler config and run `npx wrangler types`:

```jsonc
// wrangler.jsonc
{ "flagship": [{ "binding": "FLAGS", "app_id": "<APP_ID>" }] }
```

## Usage

```ts
import { FeatureFlagModule } from '@stratal/feature-flags'

@Module({
  imports: [
    FeatureFlagModule.forRoot({
      apps: [{ binding: 'FLAGS', flags: { 'new-checkout': false } }],
      context: (ctx) => ({ userId: ctx.user().id }), // ctx.user() from @stratal/framework
    }),
  ],
})
export class AppModule {}
```

A Worker can bind to several Flagship apps — list each one under `apps`, and set `default` to pick the binding the injected `FeatureFlagService` uses. Flagship has no enumeration API, so the `flags` manifest declares what you intend to evaluate and share, and its values double as defaults.

To expose flags to an Inertia frontend, register `FeatureFlagShareMiddleware` where you want them — scoped to your page-rendering controllers (`router.middleware(...)`) or app-wide (`router.use(...)`).

Evaluate on the server:

```ts
const enabled = await this.flags.getBooleanValue('new-checkout') // uses manifest default
```

`getStringValue()`, `getNumberValue()` and `getObjectValue()` cover the other flag types, each with a `*Details()` variant that returns the full evaluation details. `use(binding)` switches to another bound app, and `all()` evaluates the whole manifest at once.

Read on the client:

```tsx
import { useFeatureFlags, useFlag } from '@stratal/feature-flags/react'

const showNewCheckout = useFlag('new-checkout')
const flags = useFeatureFlags()
```

## Typed flag keys

Augment `FeatureFlagRegistry` once and both the service and the hooks get typed keys:

```ts
declare module '@stratal/feature-flags' {
  interface FeatureFlagRegistry {
    'new-checkout': boolean
    'checkout-flow': string
  }
}
```

## Documentation

See the framework docs at **[stratal.dev](https://stratal.dev)** for the full API.

## Support the project

If Stratal is useful to you, **[star the repository](https://github.com/strataljs/stratal)** — it is the simplest way to help others find it.

## Maintainer

Built and maintained by **Temitayo Fadojutimi** — [@adesege_](https://x.com/adesege_).

## License

MIT
