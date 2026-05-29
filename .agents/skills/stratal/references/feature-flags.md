# Feature Flags (Cloudflare Flagship)

`@stratal/feature-flags` evaluates [Cloudflare Flagship](https://developers.cloudflare.com/flagship/) feature flags through the native Worker **binding API** (no OpenFeature SDK). It adds manifest defaults, a per-request evaluation context, multi-app support, opt-in Inertia sharing, and typed React hooks.

Install: `npm install @stratal/feature-flags`

## 1. Configure the Flagship binding

Add the `flagship` block to `wrangler.jsonc`, then run `npx wrangler types`:

```jsonc
{
  "flagship": [
    { "binding": "FLAGS", "app_id": "<APP_ID_1>" },
    { "binding": "EXPERIMENT_FLAGS", "app_id": "<APP_ID_2>" }
  ]
}
```

`npx wrangler types` types each binding as the global `Flagship`. Augment `StratalEnv` so binding names are type-checked:

```typescript
declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {}
}
```

## 2. Register the module

Flagship has **no API to list flags** — declare the flags you use once in each app's `flags` manifest. The declared default is reused on every evaluation and the manifest is what gets shared to the frontend.

```typescript
import { FeatureFlagModule } from '@stratal/feature-flags'

@Module({
  imports: [
    FeatureFlagModule.forRoot({
      apps: [
        { binding: 'FLAGS', flags: { 'new-checkout': false, 'checkout-flow': 'v1', 'max-uploads': 5 } },
        { binding: 'EXPERIMENT_FLAGS', flags: { 'layout-v2': false } },
      ],
      default: 'FLAGS', // optional; defaults to apps[0].binding
      // merged into every evaluation (targeting); per-call context overrides it.
      // ctx.user() is provided by @stratal/framework's AuthModule.
      context: (ctx) => ({ userId: ctx.user().id }),
    }),
  ],
})
export class AppModule {}
```

Async config:

```typescript
FeatureFlagModule.forRootAsync({
  inject: [flagsConfig.KEY],
  useFactory: (cfg) => ({ apps: cfg.apps, default: cfg.default }),
})
```

## 3. Evaluate on the server

Inject `FeatureFlagService` (token `FEATURE_FLAG_TOKENS.FeatureFlagService`). It is request-scoped, so use `@Request()`/`@Transient()` services or controllers.

```typescript
import { FEATURE_FLAG_TOKENS, type FeatureFlagService } from '@stratal/feature-flags'
import { Transient, inject } from 'stratal/di'

@Transient()
export class CheckoutService {
  constructor(
    @inject(FEATURE_FLAG_TOKENS.FeatureFlagService) private readonly flags: FeatureFlagService,
  ) {}

  async run() {
    const enabled = await this.flags.getBooleanValue('new-checkout')        // manifest default (false)
    const flow = await this.flags.getStringValue('checkout-flow', 'legacy') // explicit default wins
    const perUser = await this.flags.getBooleanValue('new-checkout', false, { country: 'US' }) // merges context
  }
}
```

Methods mirror the binding API; the `defaultValue` is optional (falls back to the manifest):

| Method | Returns |
|--------|---------|
| `get(key, default?, ctx?)` | `unknown` (raw) |
| `getBooleanValue(key, default?, ctx?)` | `boolean` |
| `getStringValue(key, default?, ctx?)` | `string` |
| `getNumberValue(key, default?, ctx?)` | `number` |
| `getObjectValue<T>(key, default?, ctx?)` | `T` |
| `getBooleanDetails` / `getStringDetails` / `getNumberDetails` / `getObjectDetails` | `FlagshipEvaluationDetails<T>` (value + `reason`/`variant`/error metadata) |
| `all(ctx?)` | `Record<string, value>` — every declared flag in the current app |

Evaluation never throws — the binding returns the default on error.

### Multiple apps

Switch apps with `use(binding)`, which returns a new immutable instance bound to that app's binding + manifest:

```typescript
const exp = await this.flags.use('EXPERIMENT_FLAGS').getBooleanValue('layout-v2')
```

## 4. Inertia sharing (frontend)

`FeatureFlagShareMiddleware` evaluates the default app's manifest on each page render (GET) and shares it as the `featureFlags` prop. It is **not** registered for you — register it from a module's `configureRoutes`, scoped to the controllers that render flag-aware pages (`router.middleware(...)`) or app-wide (`router.use(...)`):

```typescript
import { FeatureFlagModule, FeatureFlagShareMiddleware } from '@stratal/feature-flags'
import type { RouteConfigurable, Router } from 'stratal/router'

@Module({
  imports: [
    InertiaModule.forRoot({ rootView }),
    FeatureFlagModule.forRoot({ apps: [{ binding: 'FLAGS', flags: { 'new-checkout': false } }] }),
  ],
  controllers: [DashboardController],
})
export class DashboardModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.middleware(FeatureFlagShareMiddleware)        // only this module's controllers
    // ...or app-wide from the root module: router.use(FeatureFlagShareMiddleware)
  }
}
```

The middleware no-ops on non-GET requests and when `@stratal/inertia` isn't installed.

Read flags in React with `@stratal/feature-flags/react`:

```tsx
import { useFlag, useFeatureFlags } from '@stratal/feature-flags/react'

function Checkout() {
  const showNew = useFlag('new-checkout')          // typed via FeatureFlagRegistry
  const layout = useFlag('checkout-flow', 'v1')    // explicit default (loose)
  const all = useFeatureFlags()                    // full map
  return showNew ? <NewCheckout /> : <LegacyCheckout />
}
```

### Typed flag keys

Augment `FeatureFlagRegistry` to type `useFlag` keys and return values:

```typescript
declare module '@stratal/feature-flags' {
  interface FeatureFlagRegistry {
    'new-checkout': boolean
    'checkout-flow': string
    'max-uploads': number
  }
}
```

## Notes

- Binding API only — no `@cloudflare/flagship` OpenFeature SDK, no HTTP fallback.
- `FeatureFlagError` is thrown only for misconfiguration (unknown app, or a binding missing from the environment).
