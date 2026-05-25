# Errors & I18n

## ExceptionHandler

Customize how your app reports and renders errors. Extend `ExceptionHandler` and implement `register()`.

### Setup

```typescript
import { ExceptionHandler } from 'stratal/errors'
import { Transient } from 'stratal/di'

@Transient()
export class AppExceptionHandler extends ExceptionHandler {
  register(): void {
    // Report specific errors to external services
    this.reportable(PaymentError, (error, context) => {
      sentry.captureException(error)
    })

    // Custom rendering for specific errors
    this.renderable(MaintenanceError, (error, context) => {
      return new Response('Service temporarily unavailable', { status: 503 })
    })

    // Suppress logging for expected errors
    this.dontReport([RouteNotFoundError])

    // Override log severity
    this.level(RecordNotFoundError, 'warn')

    // Add global context to all error logs
    this.context(() => ({
      region: this.env.CF_REGION,
      deployId: this.env.DEPLOY_ID,
    }))

    // Post-process all error responses
    this.respond((response, error, context) => {
      response.headers.set('X-Request-Id', context.type === 'http' ? context.ctx.c.req.header('x-request-id') ?? '' : '')
      return response
    })

    // Render a custom HTML page per status (browser/Inertia first-loads)
    this.errorPage((errorResponse, status, context) => {
      if (status === 503) {
        return new Response(myMaintenanceHtml(), {
          status,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
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
- `renderable(ErrorClass, callback)` — Custom rendering. Return `Response | ErrorResponse | undefined`. Return `undefined` to fall through to default.
- `errorPage(callback)` — Render the HTML error page for HTTP requests that accept `text/html`. Callback: `(errorResponse, status, context, error) => Response | Promise<Response | undefined> | undefined`. Walked in registration order (first non-undefined wins). Return `undefined` to defer.
- `dontReport([...classes])` — Suppress logging for these error types.
- `level(ErrorClass, severity)` — Override log level (`'debug' | 'info' | 'warn' | 'error'`).
- `context(callback)` — Add key-value pairs to all error log entries.
- `respond(callback)` — Transform the final Response before sending.
- `resolve(token)` — Access DI container inside callbacks.

### Default Behavior

- **Severity**: 5xx → `'error'`, 4xx → `'warn'`.
- **Production 5xx**: response message is replaced with a generic status text (e.g., "Internal Server Error"). Actual message is logged but not sent to the client.
- **4xx or development**: response includes the actual `error.message`.
- **Stack traces**: only included in development responses.

### ExceptionContext

Discriminated union — check `context.type` to determine the error source:

```typescript
this.renderable(PaymentError, (error, context) => {
  if (context.type === 'http') {
    return context.ctx.json({ error: error.message }, 500)
  }
})
```

| Type | Available Properties |
|------|---------------------|
| `http` | `ctx` (RouterContext) |
| `queue` | `queueName` (string) |
| `cron` | (none) |
| `cli` | `commandName` (string) |

### Content Negotiation

- **HTML accepted** — Walks registered `errorPage` callbacks (first non-undefined wins); falls back to `renderDefaultHtml`.
- **Otherwise** — Returns JSON `ErrorResponse` (`{ message, timestamp, stack? }`).

Customize HTML: use `errorPage(cb)` for dynamic rendering, override `renderDefaultHtml()` for a branded static fallback, override `wantsHtml()` to change content negotiation.

### Reportable with Stop

```typescript
this.reportable(ExternalApiError, (error) => {
  externalLogger.log(error)
}).stop()
```

## ApplicationError

Base class for all errors. Non-abstract — can be instantiated directly or extended.

```typescript
import { ApplicationError } from 'stratal/errors'

class ApplicationError extends Error {
  public readonly timestamp: string
  constructor(message?: string, cause?: unknown)
}
```

Defaults to 500 in the exception handler. Plain English messages, no i18n keys. Use `cause` to chain errors — the default reporter logs the full cause chain.

### Custom App Errors (500)

Extend `ApplicationError` for app-specific 500 errors:

```typescript
import { ApplicationError } from 'stratal/errors'

export class PaymentProcessingError extends ApplicationError {
  constructor(reason: string, cause?: unknown) {
    super(`Payment processing failed: ${reason}`, cause)
  }
}
```

## HttpException

For errors with a specific HTTP status code. Base for all non-500 error classes.

```typescript
import { HttpException, abort } from 'stratal/errors'

throw new HttpException(404, 'Resource not found')
throw new HttpException(422, 'Invalid input')

// abort() helper — throws HttpException, typed as never
abort(403, 'Access denied')
```

### Custom Non-500 Error Classes

Extend `HttpException` with a baked-in status. No constructor args needed:

```typescript
import { HttpException } from 'stratal/errors'

export class NoteNotFoundError extends HttpException {
  constructor() {
    super(404, 'Note not found')
  }
}

// Usage
throw new NoteNotFoundError()

// Consumer instanceof
this.renderable(NoteNotFoundError, (error, context) => {
  return context.ctx.json({ error: 'Note not found' }, 404)
})
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

**Reserved top-level namespaces** (owned by core — do not reuse as a module namespace): `common`, `emails`, `validation`, `zodI18n`. You may still register additional locale translations for these, but you may not augment their type shapes.

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

## withZodI18n() for Zod Validation

Use `withZodI18n()` to attach i18n message keys to Zod validators:

```typescript
import { z, withZodI18n } from 'stratal/validation'

export const createNoteSchema = z.object({
  title: z.string()
    .min(1, withZodI18n('notes.validation.title.required'))
    .max(255, withZodI18n('notes.validation.title.max', { max: 255 })),
  content: z.string().optional(),
}).openapi('CreateNote')
```

`withZodI18n(key, params?)` returns `{ error: () => string }` — a Zod error config that resolves the i18n message at validation time using the current request's locale context.

## withI18n() — General Translation Helper

Use `withI18n()` to translate a message key anywhere in request-scoped code — services, middleware, error handlers, etc. Not tied to Zod.

```typescript
import { withI18n } from 'stratal/i18n'

const message = withI18n('errors.notFound')
const greeting = withI18n('common.welcome', { name: 'Alice' })
```

Returns the translated string directly. Uses the current request's locale. Returns the key itself when called outside a request context (e.g., during startup).

## cuid2() — Use Instead of z.cuid2()

Zod 4.3.6's `z.cuid2()` regex is `/^[0-9a-z]+$/`, which accepts any non-empty lowercase-alphanumeric string (including 2-letter locale codes like `'sw'`). Always use Stratal's `cuid2()` for real cuid2 validation:

```ts
import { z, cuid2, withZodI18n } from 'stratal/validation'

// Default — 24-32 lowercase alphanumeric chars, must start with a letter
const tenantSchema = z.object({ tenantId: cuid2() })

// Custom pattern (e.g. fixed-length 24)
cuid2({ pattern: /^[a-z][0-9a-z]{23}$/ })

// Plain-string error
cuid2({ error: 'Invalid tenant ID' })

// Translatable error — pass a withZodI18n() result.
// NEVER pass an i18n key string directly to `error`.
cuid2(withZodI18n('tenants.errors.invalidId'))

// Compose with anything Zod string accepts
cuid2().describe('Tenant ID')
```

`CUID2_REGEX` is also exported for callers who want to reuse the pattern in other shapes.

## Type-Safe Message Keys

`MessageKeys` is derived from two sources:

1. **System keys** — inferred from core's built-in `common.*`, `emails.*`, `validation.*`, `zodI18n.*` messages.
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
