# I18n Module

Internationalization (i18n) module for the backend, following NestJS dynamic module patterns.

## Features

- Type-safe message keys with IDE autocomplete
- Named parameter interpolation (`{userId}`, `{email}`)
- Auto-locale detection from X-Locale header
- Queue message locale propagation (automatic)
- Error message localization
- Request-scoped translation context
- Dynamic module with `withRoot()` configuration
- Core messages + app messages separation
- Module augmentation for type-safe keys

## Architecture

### Dynamic Module Pattern

I18nModule follows NestJS dynamic module pattern:

```typescript
// In CoreModule (apps/backend/src/core/index.ts)
import { Module, I18nModule } from 'stratal'
import { i18nConfig } from '../i18n'

@Module({
  imports: [
    I18nModule.withRoot(i18nConfig),
    // ... other core modules
  ]
})
class CoreModule {}
export default CoreModule
```

### Configuration Options

```typescript
// apps/backend/src/i18n/index.ts
import { messages } from 'stratal/i18n'
import type { I18nModuleOptions } from 'stratal'

export const i18nConfig: I18nModuleOptions = {
  defaultLocale: 'en',
  fallbackLocale: 'en',
  locales: ['en'],
  messages  // All locale messages from core
}
```

### Message Architecture

Messages are organized in `packages/core/src/i18n/messages/`:

1. **Core Messages** (`en/common.ts`, `en/errors.ts`, `en/emails.ts`)
   - Error messages used by infrastructure
   - API documentation strings
   - Internal module messages

2. **Validation & Zod Messages** (`en/validation.ts`, `en/zod.ts`)
   - User-facing validation messages
   - Zod error translations
   - Additional locales can be added

### Core Components

1. **Message Loader Service** (`MessageLoaderService`)
   - Singleton service that merges core and app messages
   - Pre-compiles messages to AST for Cloudflare Workers compatibility
   - Caches compiled messages in memory

2. **I18n Service** (`I18nService`)
   - Request-scoped service for translations
   - Reads locale from RouterContext
   - Uses intlify's `@intlify/core-base` for translation

3. **Middleware**
   - `LocaleExtractionMiddleware`: Extracts locale from X-Locale header
   - `I18nContextMiddleware`: Sets up Zod i18n validation context

### Type-Safe Message Keys

The module uses TypeScript module augmentation for type-safe keys:

```typescript
// apps/backend/src/i18n/types.ts
import { Messages } from 'stratal/i18n'

declare module 'stratal' {
  interface AppMessages extends Messages {}
}
```

This enables autocomplete for both system and app message keys:

```typescript
// System keys work
this.i18n.t('errors.routeNotFound', { method: 'GET', path: '/api' })

// App keys work
this.i18n.t('common.app.name')
```

### Locale Flow

```
HTTP Request -> X-Locale Header -> LocaleExtractionMiddleware -> RouterContext -> I18nService
   |
   v
Queue Message -> metadata.locale -> Consumer -> I18nService -> Translated Message
```

## Usage

### In Services

```typescript
import { inject } from 'tsyringe'
import { I18N_TOKENS, type II18nService } from 'stratal'

@Transient()
export class NotificationService {
  constructor(
    @inject(I18N_TOKENS.I18nService)
    private readonly i18n: II18nService
  ) {}

  async sendWelcomeEmail(user: User): Promise<void> {
    const subject = this.i18n.t('emails.welcome.subject', {
      userName: user.firstName
    })
    // ...
  }
}
```

### In Error Classes

Error classes use message keys translated by `GlobalErrorHandler`:

```typescript
import { ApplicationError, ERROR_CODES } from 'stratal'

export class UserNotFoundError extends ApplicationError {
  constructor(userId: string) {
    super(
      'errors.auth.userNotFound',  // Message key
      ERROR_CODES.USERS.NOT_FOUND,
      { userId }
    )
  }
}
```

### In Queue Consumers

Queue messages automatically include locale in metadata:

```typescript
export class EmailQueueConsumer implements QueueConsumer<EmailPayload> {
  async handle(message: QueueMessage<EmailPayload>): Promise<void> {
    const locale = message.metadata?.locale || 'en'
    // ...
  }
}
```

## Adding New App Messages

Add messages to `packages/core/src/i18n/messages/`:

```typescript
// packages/core/src/i18n/messages/en/users.ts
export const users = {
  welcome: 'Welcome, {name}!',
  profile: {
    updated: 'Your profile has been updated'
  }
} as const
```

Then update the barrel exports in `en/index.ts`.

## System Message Keys

System messages in `packages/core` include:

- `errors.*` - All infrastructure error messages
- `common.api.*` - OpenAPI documentation strings
- `emails.magicLink.subject` - Auth email subject

These are automatically available to all applications using this module.

## JIT Message Compilation

For Cloudflare Workers compatibility, the module uses JIT compilation that generates AST instead of JavaScript code.

**Automatic Initialization:** When `I18nModule` is imported, both `setupI18nCompiler()` and `z.config({ customError: backendErrorMap })` are called automatically at module load time. No manual setup is required in application entry points.

## Best Practices

### DO
- Use message keys in error classes
- Provide parameters for interpolation in metadata
- Keep messages concise and clear
- Organize messages by category
- Use consistent parameter naming (`{userId}`, not `{id}`)

### DON'T
- Don't hardcode user-facing strings
- Don't use English strings directly in code
- Don't translate log messages (logs are for developers)
- Don't create duplicate message keys
- Don't skip translations for any supported locale

## Related Documentation

- [Backend Agent Guide](/docs/agents/backend.md) - Backend patterns
- [Error Handling](/docs/error-codes.md) - Error code registry
- [Queue System](../queue/) - Message queue documentation
