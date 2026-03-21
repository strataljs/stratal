# Routing

## Controller Decorator

```typescript
import { Controller } from 'stratal/router'
import type { ControllerOptions } from 'stratal/router'

@Controller('/api/v1/notes', {
  tags: ['Notes'],              // OpenAPI tags
  security: ['bearerAuth'],     // Default security for all routes
  hideFromDocs: false,          // Hide all routes from OpenAPI docs
  version: '1',                 // API version (requires versioning config)
})
export class NotesController { ... }
```

`@Controller()` auto-applies `@Transient()` — do not double-decorate.

## Convention-Based Routing (@Route)

Best suited for REST resource controllers. Method names auto-map to HTTP method + path + status code:

| Method     | HTTP   | Path              | Status |
|-----------|--------|-------------------|--------|
| `index()`  | GET    | `/base-path`      | 200    |
| `show()`   | GET    | `/base-path/:id`  | 200    |
| `create()` | POST   | `/base-path`      | 201    |
| `update()` | PUT    | `/base-path/:id`  | 200    |
| `patch()`  | PATCH  | `/base-path/:id`  | 200    |
| `destroy()`| DELETE | `/base-path/:id`  | 200    |

```typescript
import { Route } from 'stratal/router'
import { z } from 'stratal/validation'

@Route({
  body: createNoteSchema,               // Request body (POST/PUT/PATCH)
  params: z.object({ id: z.string() }), // URL parameters
  query: paginationSchema,              // Query parameters
  response: noteSchema,                 // Response schema (required)
  tags: ['Extra Tag'],                  // Merged with controller tags
  security: [],                         // Override: empty = public
  description: 'Create a note',
  summary: 'Creates a new note',
  hideFromDocs: false,
})
async create(ctx: RouterContext): Promise<Response> { ... }
```

## Explicit HTTP Method Decorators

Use when convention names don't fit. Cannot mix with `@Route()` in the same controller.

```typescript
import { Get, Post, Put, Patch, Delete, All } from 'stratal/router'
import { inject } from 'stratal/di'

@Controller('/api/v1/notes')
export class NotesController {
  @Get('/', { response: z.array(noteSchema), summary: 'List notes' })
  async list(ctx: RouterContext) { ... }

  @Post('/', { body: createNoteSchema, response: noteSchema, statusCode: 201 })
  async createNote(ctx: RouterContext) { ... }

  @Get('/:id', {
    params: z.object({ id: z.string().uuid() }),
    response: noteSchema,
  })
  async getNote(ctx: RouterContext) { ... }

  @Put('/:id', {
    params: z.object({ id: z.string().uuid() }),
    body: updateNoteSchema,
    response: noteSchema,
  })
  async updateNote(ctx: RouterContext) { ... }

  @Delete('/:id', {
    params: z.object({ id: z.string().uuid() }),
    response: z.object({}),
  })
  async deleteNote(ctx: RouterContext) { ... }
}
```

## RouteConfig

```typescript
interface RouteConfig {
  body?: ZodType | { schema: ZodType; contentType?: string }
  params?: ZodObject | ZodPipe           // URL params
  query?: ZodObject | ZodPipe            // Query params
  response: ZodType | { schema: ZodType; description?: string; contentType?: string }
  tags?: string[]
  security?: SecurityScheme[]            // e.g., ['bearerAuth']
  description?: string
  summary?: string
  hideFromDocs?: boolean
  statusCode?: number                    // For HTTP method decorators only
}
```

## RouterContext API

```typescript
class RouterContext {
  c: Context                             // Native Hono context
  json(data: object, status?: number): Response
  body<T>(): Promise<T>                  // Validated request body
  param(key: string): string             // URL param (e.g., :id)
  query(key?: string): Record | string   // Query params
  header(name: string): string | undefined
  text(text: string, status?: number): Response
  html(html: string, status?: number): Response
  redirect(url: string, status?: number): Response
  stream(callback): Response             // Binary streaming
  streamText(callback): Response         // Text streaming (sets Content-Encoding: Identity)
  streamSSE(callback): Response          // Server-Sent Events
  getContainer(): Container              // Request-scoped DI container
  setLocale(locale: string): void
  getLocale(): string
}
```

## Request Body Content Types

```typescript
// Default: application/json
@Route({ body: createSchema, response: schema })

// Multipart form data
@Route({
  body: { schema: uploadSchema, contentType: 'multipart/form-data' },
  response: schema,
})
```

## Schemas with Zod

Always import `z` from `stratal/validation`. Use `.openapi('SchemaName')` to name schemas in the OpenAPI spec:

```typescript
import { z } from 'stratal/validation'

export const createNoteSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional(),
}).openapi('CreateNote')

export const noteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string().nullable(),
  createdAt: z.string().datetime(),
}).openapi('Note')
```

### i18n Validation Messages

Use `withI18n()` for translatable validation messages:

```typescript
import { z, withI18n } from 'stratal/validation'

export const createNoteSchema = z.object({
  title: z.string()
    .min(1, withI18n('validation.notes.title.required'))
    .max(255, withI18n('validation.notes.title.max', { max: 255 })),
  content: z.string().optional(),
}).openapi('CreateNote')
```

## API Versioning

Enable in the Stratal constructor:

```typescript
export default new Stratal({
  module: AppModule,
  versioning: { prefix: 'v', defaultVersion: '1' },
})
```

Use on controllers:

```typescript
import { VERSION_NEUTRAL } from 'stratal/router'

@Controller('/api/users', { version: '2' })       // -> /api/v2/users
@Controller('/api/users', { version: ['1', '2'] }) // -> /api/v1/users + /api/v2/users
@Controller('/api/health', { version: VERSION_NEUTRAL }) // -> /api/health (no prefix)
```

## OpenAPI

Routes automatically generate OpenAPI spec. Access at:
- `/api/openapi.json` — OpenAPI JSON spec
- `/api/docs` — Scalar UI

Security schemes: `'bearerAuth'` (Bearer token), `'basicAuth'` (Basic auth).

Configure via `OpenAPIModule.forRoot()`:

```typescript
import { OpenAPIModule } from 'stratal/openapi'

@Module({
  imports: [
    OpenAPIModule.forRoot({
      info: { title: 'My API', version: '1.0.0', description: 'My API description' },
    }),
  ],
})
export class AppModule {}
```
