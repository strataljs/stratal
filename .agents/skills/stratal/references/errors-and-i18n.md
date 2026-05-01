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
      'notes.errors.notFound',  // i18n key (used as message)
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
        notes: {
          errors: { notFound: 'Note {noteId} not found' },
          validation: { title: { required: 'Title is required' } },
        },
      },
      fr: {
        notes: { errors: { notFound: 'Note {noteId} introuvable' } },
      },
    }),
  ],
})
export class AppModule {}
```

### Package-Level Messages

Any module can call `registerMessages()`. Messages are deep-merged across all registrations — later calls override at leaf level.

**Each module must own one distinct top-level namespace** (e.g., `tenancy`, `billing`, `uploads`). Two modules cannot augment the same top-level key with different sub-shapes — TypeScript's interface merging requires same-named properties across declarations to be structurally identical, so sharing a parent namespace (`errors`, etc.) between modules produces a TS2717 collision.

```typescript
// packages/tenancy/src/i18n/en.ts
export const tenancyMessages = {
  en: {
    errors: { tenantNotFound: 'Tenant not found' },
  },
} as const

declare module 'stratal/i18n' {
  interface AppMessageNamespaces {
    tenancy: typeof tenancyMessages['en']
  }
}

// packages/tenancy/src/tenancy.module.ts
@Module({
  imports: [
    I18nModule.registerMessages({
      en: { tenancy: tenancyMessages.en },
      fr: { tenancy: { errors: { tenantNotFound: 'Locataire introuvable' } } },
    }),
  ],
})
export class TenancyModule {}
```

Access with flat dot-notation: `i18n.t('tenancy.errors.tenantNotFound')`.

**Reserved top-level namespaces** (owned by core — do not reuse as a module namespace): `errors`, `common`, `emails`, `validation`, `zodI18n`. You may still register additional locale translations for these (e.g., providing `fr` strings for `errors.notFound`), but you may not augment their type shapes.

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
    prefixDefaultLocale?: false | true | 'redirect'           // path strategy only, default: false
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
    return this.i18n.t('notes.errors.notFound', { noteId })
  }

  getWelcome(name: string) {
    return this.i18n.t('common.welcome', { name })
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
    .min(1, withI18n('notes.validation.title.required'))
    .max(255, withI18n('notes.validation.title.max', { max: 255 })),
  content: z.string().optional(),
}).openapi('CreateNote')
```

`withI18n(key, params?)` returns `{ error: () => string }` — a Zod error config that resolves the i18n message at validation time using `AsyncLocalStorage` to read the current locale context.

## cuid2() — Use Instead of z.cuid2()

Zod 4.3.6's `z.cuid2()` regex is `/^[0-9a-z]+$/`, which accepts any non-empty lowercase-alphanumeric string (including 2-letter locale codes like `'sw'`). Always use Stratal's `cuid2()` for real cuid2 validation:

```ts
import { z, cuid2, withI18n } from 'stratal/validation'

// Default — 24-32 lowercase alphanumeric chars, must start with a letter
const tenantSchema = z.object({ tenantId: cuid2() })

// Custom pattern (e.g. fixed-length 24)
cuid2({ pattern: /^[a-z][0-9a-z]{23}$/ })

// Plain-string error
cuid2({ error: 'Invalid tenant ID' })

// Translatable error — pass a withI18n() result.
// NEVER pass an i18n key string directly to `error`.
cuid2(withI18n('tenants.errors.invalidId'))

// Compose with anything Zod string accepts
cuid2().describe('Tenant ID')
```

`CUID2_REGEX` is also exported for callers who want to reuse the pattern in other shapes.

## Type-Safe Message Keys

`MessageKeys` is derived from two sources:

1. **System keys** — inferred from core's built-in `errors.*`, `common.*`, `emails.*`, `validation.*`, `zodI18n.*` messages.
2. **App keys** — derived from `AppMessageNamespaces`, a keyed registry each module augments with its own distinct namespace.

Augment `AppMessageNamespaces` from any module or app file (commonly colocated with the messages themselves):

```typescript
// src/modules/billing/i18n/en.ts
export const billingMessages = {
  en: {
    errors: { subscriptionNotFound: 'Subscription not found' },
    invoices: { issued: 'Invoice issued' },
  },
} as const

declare module 'stratal/i18n' {
  interface AppMessageNamespaces {
    billing: typeof billingMessages['en']
  }
}
```

Once augmented, `i18n.t('billing.errors.subscriptionNotFound')` is fully type-checked. Each module owns exactly one key on `AppMessageNamespaces`; two modules augmenting the same key with different shapes will fail with TS2717, which is the guardrail that keeps namespace ownership unambiguous.

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

#### `prefixDefaultLocale` Option

Controls whether the default locale gets a URL path prefix. Only applies when `strategy: 'path'`.

| Value | Behavior |
|-------|----------|
| `false` (default) | Default locale has no prefix (`/users`). Other locales are prefixed (`/fr/users`). Requests to the prefixed default locale (`/en/users`) return 404. |
| `'redirect'` | Same as `false`, but requests to the prefixed default locale (`/en/users`) are 301-redirected to the unprefixed path (`/users`). |
| `true` | All locales are prefixed (`/en/users`, `/fr/users`). |

```typescript
// Default behavior: default locale unprefixed
I18nModule.forRoot({
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  detection: { strategy: 'path' },
  // prefixDefaultLocale defaults to false
  // GET /users -> en, GET /fr/users -> fr, GET /en/users -> 404
})

// Redirect prefixed default locale
I18nModule.forRoot({
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  detection: { strategy: 'path', prefixDefaultLocale: 'redirect' },
  // GET /users -> en, GET /fr/users -> fr, GET /en/users -> 301 to /users
})

// All locales prefixed
I18nModule.forRoot({
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  detection: { strategy: 'path', prefixDefaultLocale: true },
  // GET /en/users -> en, GET /fr/users -> fr, GET /users -> 404
})
```

### Runtime Locale Access

- `RouterContext.setLocale(locale)` / `RouterContext.getLocale()` for runtime locale changes
- Falls back to `defaultLocale` if the detected locale is not in `locales`
