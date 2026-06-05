# @stratal/feature-flags

[Cloudflare Flagship](https://developers.cloudflare.com/flagship/) feature flags for the [Stratal](https://stratal.dev) framework, using the native Worker **binding API** — with opt-in [Inertia.js](https://inertiajs.com) sharing and typed React hooks.

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

To expose flags to an Inertia frontend, register `FeatureFlagShareMiddleware` where you want them — scoped to your page-rendering controllers (`router.middleware(...)`) or app-wide (`router.use(...)`).

Evaluate on the server:

```ts
const enabled = await this.flags.getBooleanValue('new-checkout') // uses manifest default
```

Read on the client:

```tsx
import { useFlag } from '@stratal/feature-flags/react'

const showNewCheckout = useFlag('new-checkout')
```

See the framework docs for the full API.

## License

MIT
