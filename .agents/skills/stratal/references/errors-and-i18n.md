# Errors & I18n

## ExceptionHandler

Customize how your app reports and renders errors. Extend `ExceptionHandler` and implement `register()`.

### Setup

```typescript
import { ExceptionHandler } from 'stratal/errors'
import type { ExceptionContext } from 'stratal/errors'
import { Transient } from 'stratal/di'

@Transient()
export class AppExceptionHandler extends ExceptionHandler {
  register(): void {
    // Report specific errors to external services
    this.reportable(PaymentError, (error, context) => {
      // Fire-and-forget via waitUntil — runs after response is sent
      sentry.captureException(error, { extra: error.metadata })
    })

    // Custom rendering for specific errors
    this.renderable(MaintenanceError, (error, context) => {
      return new Response('Service temporarily unavailable', { status: 503 })
    })

    // Suppress logging for expected errors
    this.dontReport([NotFoundError, ValidationError])

    // Override log severity
    this.level(RateLimitError, 'warn')

    // Add global context to all error logs
    this.context(() => ({
      region: this.env.CF_REGION,
      deployId: this.env.DEPLOY_ID,
    }))

    // Post-process all error responses
    this.respond((response, error, context) => {
      response.headers.set('X-Error-Code', String(error.code))
      return response
    })
  }
}
```

### Registration

Pass to `Stratal` constructor:

```typescript
export default new Stratal({
  module: AppModule,
  exceptionHandler: AppExceptionHandler,
})
```

### Configuration Methods

- `reportable(ErrorClass, callback)` — Custom reporting. Returns `Reportable` — chain `.stop()` to prevent default logging.
- `renderable(ErrorClass, callback)` — Custom rendering. Callback is async, returns `Response | ErrorResponse | undefined`. Return `undefined` to fall through to default.
- `dontReport([...classes])` — Suppress logging for these error types.
- `level(ErrorClass, severity)` — Override log level (`'debug' | 'info' | 'warn' | 'error'`).
- `context(callback)` — Add key-value pairs to all error log entries.
- `respond(callback)` — Transform the final Response before sending.
- `resolve(token)` — Access DI container inside callbacks.

### ExceptionContext

Discriminated union — check `context.type` to determine the error source:

```typescript
this.renderable(AppError, (error, context) => {
  if (context.type === 'http') {
    // context.ctx is RouterContext
    return context.ctx.json({ error: error.message }, 500)
  }
  // context.type === 'queue' | 'cron' | 'cli'
})
```

| Type | Available Properties |
|------|---------------------|
| `http` | `ctx` (RouterContext) |
| `queue` | `queueName` (string) |
| `cron` | (none) |
| `cli` | `commandName` (string) |

### Content Negotiation

The default handler automatically negotiates response format:
- **HTML accepted + production** — Renders a minimal branded HTML error page
- **HTML accepted + development** — Re-throws for runtime error UI
- **Otherwise** — Returns JSON `ErrorResponse`

Override with `renderable()` or override `wantsHtml(context)` in your subclass.

### Reportable with Stop

Chain `.stop()` to prevent the default logger from also reporting:

```typescript
this.reportable(ExternalApiError, (error) => {
  externalLogger.log(error)
}).stop()  // Only external logger reports, not Stratal's logger
```

## ApplicationError

Base class for all structured errors in Stratal. Extend it for custom domain errors.

```typescript
import { ApplicationError } from 'stratal/errors'
import type { ErrorCode, MessageKeys } from 'stratal/errors'

export class NoteNotFoundError extends ApplicationError {
  constructor(noteId: string) {
    super(
      'errors.notes.not_found',  // i18n key (used as message)
      5000 as ErrorCode,                         // Custom error code
      { noteId },                                // Optional metadata
    )
  }
}
```

### ApplicationError Shape

```typescript
abstract class ApplicationError extends Error {
  public readonly code: ErrorCode
  public readonly timestamp: string           // ISO string
  public readonly metadata?: Record<string, unknown>

  constructor(i18nKey: MessageKeys, code: ErrorCode, metadata?: Record<string, unknown>)
  toErrorResponse(env: 'development' | 'production', translatedMessage?: string): ErrorResponse
}
```

`Error.message` holds the i18n key. The `toErrorResponse()` method returns a structured JSON response (stack trace only included in development mode).

## Error Code Ranges

Built-in error code ranges (your custom errors should use 5000-8999):

| Range | Category |
|-------|----------|
| 1000-1999 | Validation |
| 2000-2999 | Database |
| 3000-3099 | Authentication |
| 3100-3199 | Authorization |
| 4000-4199 | Resource |
| 5000-8999 | **Available for app-specific errors** |
| 9000-9999 | System/Infrastructure |

Access built-in codes via `ERROR_CODES`:

```typescript
import { ERROR_CODES } from 'stratal/errors'

ERROR_CODES.DATABASE.RECORD_NOT_FOUND  // 2001
ERROR_CODES.AUTH.INVALID_CREDENTIALS   // 3000
ERROR_CODES.VALIDATION.GENERIC         // 1000
```

## I18nModule

### Setup

`forRoot()` configures locale settings. `registerMessages()` adds translations (call from any module).

```typescript
import { I18nModule } from 'stratal/i18n'

@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      fallbackLocale: 'en',
      locales: ['en', 'fr'],
    }),
    I18nModule.registerMessages({
      en: {
        errors: { notes: { not_found: 'Note {noteId} not found' } },
        validation: { notes: { title: { required: 'Title is required' } } },
      },
      fr: {
        errors: { notes: { not_found: 'Note {noteId} introuvable' } },
      },
    }),
  ],
})
export class AppModule {}
```

### Package-Level Messages

Any module can call `registerMessages()`. Messages are deep-merged across all registrations — later calls override at leaf level.

```typescript
@Module({
  imports: [
    I18nModule.registerMessages({
      en: { tenancy: { tenantNotFound: 'Tenant not found' } },
      fr: { tenancy: { tenantNotFound: 'Locataire introuvable' } },
    }),
  ],
})
export class TenancyModule {}
```

The module auto-registers language detection middleware on all routes. Locale is detected based on the configured `detection` strategy.

### I18nModule Options

```typescript
interface I18nModuleOptions {
  defaultLocale?: string    // default: 'en'
  fallbackLocale?: string   // default: 'en'
  locales?: string[]        // default: ['en']
  detection?: {
    enabled?: boolean       // default: true
    strategy?: 'cookie' | 'header' | 'querystring' | 'path'  // default: 'cookie'
  } | { enabled: false }
}
```

## I18nService

```typescript
import { I18N_TOKENS } from 'stratal/i18n'
import type { I18nService } from 'stratal/i18n'
import { Transient, inject } from 'stratal/di'

@Transient()
export class MyService {
  constructor(
    @inject(I18N_TOKENS.I18nService) private i18n: I18nService,
  ) {}

  getMessage(noteId: string) {
    return this.i18n.t('errors.notes.not_found', { noteId })
  }

  getWelcome(name: string) {
    return this.i18n.t('messages.welcome', { name })
  }
}
```

Default locale messages are at `stratal/i18n/messages/en`.

## withI18n() for Zod Validation

Use `withI18n()` to attach i18n message keys to Zod validators:

```typescript
import { z, withI18n } from 'stratal/validation'

export const createNoteSchema = z.object({
  title: z.string()
    .min(1, withI18n('validation.notes.title.required'))
    .max(255, withI18n('validation.notes.title.max', { max: 255 })),
  content: z.string().optional(),
}).openapi('CreateNote')
```

`withI18n(key, params?)` returns `{ error: () => string }` — a Zod error config that resolves the i18n message at validation time using `AsyncLocalStorage` to read the current locale context.

## MessageKeys Type

Augment `MessageKeys` for type-safe i18n keys:

```typescript
// src/types/i18n.d.ts
declare module 'stratal/i18n' {
  interface MessageKeys extends typeof appEnMessage {}
}
```

## Language Detection

Locale is detected automatically from incoming requests via the `detection` option on `I18nModule.forRoot()`.

### Detection Strategies

| Strategy | Source | Example |
|----------|--------|---------|
| `'cookie'` (default) | `locale` cookie | Browser sends `Cookie: locale=fr` |
| `'header'` | `Accept-Language` header | `Accept-Language: fr` |
| `'querystring'` | `?locale=` query param | `/api/users?locale=fr` |
| `'path'` | First URL path segment | `/fr/api/users` |

### Configuration Examples

```typescript
// Cookie detection (default — no config needed)
I18nModule.forRoot({
  defaultLocale: 'en',
  locales: ['en', 'fr'],
})

// Accept-Language header
I18nModule.forRoot({
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  detection: { strategy: 'header' },
})

// Query string
I18nModule.forRoot({
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  detection: { strategy: 'querystring' },
})

// Path-based (routes auto-register with locale prefix, e.g., /en/api/users)
I18nModule.forRoot({
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  detection: { strategy: 'path' },
})

// Disable detection entirely
I18nModule.forRoot({
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  detection: { enabled: false },
})
```

### Path-Based Detection

When `strategy: 'path'` is used, all routes are registered with a `/{locale}` path prefix (e.g., `/{locale}/api/users`). The `locale` parameter is auto-injected into each route's params schema and validated against the configured `locales` array. Routes appear in OpenAPI docs with the locale as a documented path parameter.

### Runtime Locale Access

- `RouterContext.setLocale(locale)` / `RouterContext.getLocale()` for runtime locale changes
- Falls back to `defaultLocale` if the detected locale is not in `locales`
