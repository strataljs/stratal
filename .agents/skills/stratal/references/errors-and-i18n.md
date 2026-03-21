# Errors & I18n

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

```typescript
import { I18nModule } from 'stratal/i18n'

@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',           // default: 'en'
      fallbackLocale: 'en',          // default: 'en'
      locales: ['en', 'fr'],   // default: ['en']
      messages: {                    // merged with system messages
        en: {
          errors: {
            notes: { not_found: 'Note {noteId} not found' },
          },
          validation: {
            notes: {
              title: {
                required: 'Title is required',
                max: 'Title must be at most {max} characters',
              },
            },
          },
        },
        fr: {
          errors: {
            notes: { not_found: 'Note {noteId} introuvable' },
          },
        },
      },
    }),
  ],
})
export class AppModule {}
```

The module auto-registers `LocaleExtractionMiddleware` and `I18nContextMiddleware` on all routes. Locale is extracted from the `X-Locale` request header.

### I18nModule Options

```typescript
interface I18nModuleOptions {
  defaultLocale?: string                              // default: 'en'
  fallbackLocale?: string                             // default: 'en'
  locales?: string[]                                  // default: ['en']
  messages?: Record<string, Record<string, unknown>>  // merged with system messages
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

## Locale Handling

- The `X-Locale` request header controls per-request locale
- `RouterContext.setLocale(locale)` / `RouterContext.getLocale()` for runtime locale changes
- Falls back to `defaultLocale` if the requested locale isn't in `locales`
