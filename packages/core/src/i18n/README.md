# I18n Module

Internationalization module for Stratal, following NestJS-style dynamic module patterns.

## Features

- Type-safe message keys with IDE autocomplete via module augmentation
- Named parameter interpolation (`{userName}`, `{email}`)
- Auto-locale detection from `X-Locale` header
- Queue message locale propagation
- Error message localization via `GlobalErrorHandler`
- Request-scoped translation context
- Dynamic module with `withRoot()` configuration
- Core messages + app messages deep merge
- JIT message compilation (Cloudflare Workers compatible)
- Zod validation error translations

## Architecture

### Core Components

1. **`MessageLoaderService`** (singleton) — loads and caches all locale messages at startup. Deep-merges core messages with app-specific messages provided via `withRoot()`.

2. **`I18nService`** (request-scoped) — translates message keys using the current request locale from `RouterContext`. Uses `@intlify/core-base` under the hood.

3. **Middleware pipeline** — applied to all routes:
   - `LocaleExtractionMiddleware` — extracts locale from the `X-Locale` header
   - `I18nContextMiddleware` — sets up the Zod i18n validation context

### Locale Flow

```
HTTP Request -> X-Locale header -> LocaleExtractionMiddleware -> RouterContext -> I18nService
Queue Message -> metadata.locale -> Consumer -> I18nService
```

## Configuration

`I18nModule` is included as a core module by default. To add app-specific messages or additional locales, use `withRoot()`:

```typescript
import { Module, I18nModule } from 'stratal'
import type { I18nModuleOptions } from 'stratal'
import * as en from './messages/en'
import * as fr from './messages/fr'

const i18nConfig: I18nModuleOptions = {
  defaultLocale: 'en',
  fallbackLocale: 'en',
  locales: ['en', 'fr'],
  messages: { en, fr }
}

@Module({
  imports: [I18nModule.withRoot(i18nConfig)]
})
export class AppModule {}
```

### `I18nModuleOptions`

| Option           | Type                                   | Default | Description                                              |
|------------------|----------------------------------------|---------|----------------------------------------------------------|
| `defaultLocale`  | `string`                               | `'en'`  | Locale used when no `X-Locale` header is present         |
| `fallbackLocale` | `string`                               | `'en'`  | Locale used when a translation key is missing            |
| `locales`        | `string[]`                             | `['en']` | List of supported locales                               |
| `messages`       | `Record<string, Record<string, unknown>>` | `{}`    | App-specific messages, keyed by locale                   |

## Type-Safe Message Keys

The module uses TypeScript module augmentation to provide autocomplete for message keys. The `AppMessages` interface in `stratal` is empty by default — augment it with the shape of your app's messages for a single locale:

```typescript
// In your app's type declarations
import type * as appEn from './messages/en'

declare module 'stratal' {
  interface AppMessages extends typeof appEn {}
}
```

This gives you autocomplete for both system and app message keys:

```typescript
this.i18n.t('errors.routeNotFound', { method: 'GET', path: '/api' }) // system key
this.i18n.t('users.welcome', { name: 'Alice' })                      // app key
```

> **Note:** `AppMessages` should extend `typeof yourLocaleMessages` (the shape of a single locale's message object), not the `Messages` type exported from `stratal/i18n`. The `Messages` type represents the full `{ en: { ... } }` object containing all locales.

## Usage

### In Services

```typescript
import { inject } from 'tsyringe'
import { Transient, I18N_TOKENS, type II18nService } from 'stratal'

@Transient()
export class NotificationService {
  constructor(
    @inject(I18N_TOKENS.I18nService) private readonly i18n: II18nService
  ) {}

  getWelcomeMessage(user: { firstName: string }): string {
    return this.i18n.t('emails.welcome.subject', { userName: user.firstName })
  }
}
```

### In Error Classes

Error classes use message keys that `GlobalErrorHandler` translates at response time:

```typescript
import { ApplicationError, ERROR_CODES } from 'stratal'

export class UserNotFoundError extends ApplicationError {
  constructor(userId: string) {
    super('errors.auth.userNotFound', ERROR_CODES.USERS.NOT_FOUND, { userId })
  }
}
```

### Zod Validation with `withI18n`

Use the `withI18n` helper for type-safe, localized Zod error messages:

```typescript
import { z, withI18n } from 'stratal/validation'

const schema = z.object({
  email: z.string().email(withI18n('validation.email')),
  name: z.string().min(2, withI18n('validation.minLength', { min: 2 }))
})
```

## Core Messages

System messages are provided in `en` by default and organized into categories:

- `common` — general application strings
- `errors` — infrastructure error messages
- `emails` — email-related strings
- `validation` — user-facing validation messages
- `zodI18n` — Zod error translations

These are automatically available to all applications using the module.

## DI Tokens

All tokens are exported from `stratal` via `I18N_TOKENS`:

| Token                          | Service                  | Scope     |
|--------------------------------|--------------------------|-----------|
| `I18N_TOKENS.MessageLoader`   | `MessageLoaderService`   | Singleton |
| `I18N_TOKENS.I18nService`     | `I18nService`            | Request   |
| `I18N_TOKENS.Options`         | `I18nModuleOptions`      | Value     |

## JIT Message Compilation

The module uses JIT compilation via `@intlify/core-base` which generates AST instead of JavaScript code. This avoids CSP violations (`eval`/`new Function`) in Cloudflare Workers. Both `setupI18nCompiler()` and Zod error map configuration are called automatically when `I18nModule` is imported — no manual setup is required.
