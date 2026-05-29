# @stratal/feature-flags

[Cloudflare Flagship](https://developers.cloudflare.com/flagship/) feature flags for the [Stratal](https://stratal.dev) framework, using the native Worker **binding API** — with zero-config [Inertia.js](https://inertiajs.com) auto-sharing and typed React hooks.

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

When `@stratal/inertia` is installed, declared flags are auto-shared to every Inertia page — no extra wiring.

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
