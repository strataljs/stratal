# Routing Reference

## Controller Decorator

```typescript
import { Controller, type ControllerOptions } from 'stratal/router'

@Controller(path: string, options?: ControllerOptions)
```

**ControllerOptions:**
```typescript
interface ControllerOptions {
  tags?: string[]              // Default OpenAPI tags for all routes
  security?: SecurityScheme[]  // Default security for all routes
  hideFromDocs?: boolean       // Hide all routes from OpenAPI docs
}
```

Security scheme identifiers: `'bearerAuth'`, `'apiKey'`, `'sessionCookie'`.

## Route Decorator

```typescript
import { Route } from 'stratal/router'

@Route(config: RouteConfig)
```

**RouteConfig:**
```typescript
interface RouteConfig {
  body?: ZodType                                          // Request body schema (POST, PUT, PATCH)
  params?: ZodObject | ZodPipe                            // URL parameters schema
  query?: ZodObject | ZodPipe                             // Query parameters schema
  response: ZodType | { schema: ZodType; description?: string }  // Response schema (required)
  tags?: string[]                                         // OpenAPI tags (merged with controller tags)
  security?: SecurityScheme[]                             // Security schemes (merged with controller; [] = public)
  description?: string                                    // OpenAPI description
  summary?: string                                        // OpenAPI summary
  hideFromDocs?: boolean                                  // Hide from OpenAPI docs
}
```

## IController Interface

Controllers **must** implement `IController`:

```typescript
import { type IController, type RouterContext } from 'stratal/router'

interface IController {
  index?(ctx: RouterContext): Promise<Response> | Response     // GET /path
  show?(ctx: RouterContext): Promise<Response> | Response      // GET /path/:id
  create?(ctx: RouterContext): Promise<Response> | Response    // POST /path
  update?(ctx: RouterContext): Promise<Response> | Response    // PUT /path/:id
  patch?(ctx: RouterContext): Promise<Response> | Response     // PATCH /path/:id
  destroy?(ctx: RouterContext): Promise<Response> | Response   // DELETE /path/:id
  handle?(ctx: RouterContext): Promise<Response> | Response    // Custom (wildcard/non-RESTful)
}
```

Use `handle()` for non-RESTful routes (e.g., wildcard paths like `/api/v1/auth/*`). It takes precedence over RESTful methods if defined.

## RouterContext API

`RouterContext` wraps Hono's context and provides type-safe request/response methods:

```typescript
class RouterContext {
  // Access underlying Hono context
  readonly c: Context

  // DI container for the current request
  getContainer(): Container

  // Locale
  setLocale(locale: string): void
  getLocale(): string

  // Response methods
  json(data: object, status?: number): Response
  text(text: string, status?: number): Response
  html(html: string, status?: number): Response
  redirect(url: string, status?: number): Response

  // Request methods
  param(key: string): string                    // URL parameter (e.g., :id)
  query(key?: string): string | Record<string, unknown> | undefined
  header(name: string): string | undefined      // Request header
  body<T>(): Promise<T>                         // Pre-validated request body
}
```

**Important:** Use `ctx.body<T>()` to access the request body — it returns data already validated by the Zod schema from `@Route({ body: ... })`. Do **not** use `ctx.c.req.valid('json')` directly.

## OpenAPI Setup

```typescript
import { Module, OpenAPIModule } from 'stratal'

@Module({
  imports: [
    OpenAPIModule.forRoot({
      info: {
        title: 'My API',
        version: '1.0.0',
        description: 'API description',
      },
      jsonPath: '/api/openapi.json',  // default
      docsPath: '/api/docs',          // default (Scalar UI)
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    }),
  ],
})
export class AppModule {}
```

Async configuration when config depends on injected services:

```typescript
OpenAPIModule.forRootAsync({
  useFactory: (configService) => ({
    info: {
      title: configService.get('API_TITLE'),
      version: configService.get('API_VERSION'),
    },
  }),
  inject: [CONFIG_TOKENS.ConfigService],
})
```

## Tags and Security Merging

- Route-level `tags` are **appended** to controller-level tags
- Route-level `security` **replaces** controller-level security
- Set `security: []` on a route to make it public (no auth required)

```typescript
@Controller('/api/v1/notes', {
  tags: ['Notes'],
  security: ['bearerAuth'],
})
export class NotesController implements IController {
  // Tags: ['Notes'], Security: bearerAuth
  @Route({ response: noteListSchema })
  async index(ctx: RouterContext) { ... }

  // Tags: ['Notes', 'Mutations'], Security: bearerAuth
  @Route({ response: noteSchema, tags: ['Mutations'] })
  async create(ctx: RouterContext) { ... }

  // Tags: ['Notes'], Security: NONE (public route)
  @Route({ response: noteSchema, security: [] })
  async show(ctx: RouterContext) { ... }
}
```

## Hiding Routes from OpenAPI

```typescript
// Hide entire controller
@Controller('/api/internal', { hideFromDocs: true })
export class InternalController implements IController { ... }

// Hide single route
@Route({ response: healthSchema, hideFromDocs: true })
async healthCheck(ctx: RouterContext) { ... }
```

## Complete CRUD Example

```typescript
import { Controller, Route, type IController, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { inject } from 'stratal/di'
import { Transient } from 'stratal/di'

// --- Schemas ---
const noteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
})

const updateNoteSchema = createNoteSchema.partial()

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// --- Tokens ---
const NOTE_TOKENS = {
  NoteService: Symbol.for('NoteService'),
}

// --- Service ---
@Transient()
export class NoteService {
  constructor(
    @inject(DI_TOKENS.Database) private readonly db: D1Database,
  ) {}

  async findAll(page: number, limit: number) { /* ... */ }
  async findById(id: string) { /* ... */ }
  async create(data: { title: string; content: string }) { /* ... */ }
  async update(id: string, data: Partial<{ title: string; content: string }>) { /* ... */ }
  async delete(id: string) { /* ... */ }
}

// --- Controller ---
@Controller('/api/v1/notes', { tags: ['Notes'], security: ['bearerAuth'] })
export class NotesController implements IController {
  constructor(
    @inject(NOTE_TOKENS.NoteService) private readonly noteService: NoteService,
  ) {}

  @Route({
    query: paginationSchema,
    response: z.array(noteSchema),
    summary: 'List all notes',
  })
  async index(ctx: RouterContext) {
    const { page, limit } = ctx.query()
    const notes = await this.noteService.findAll(page, limit)
    return ctx.json(notes)
  }

  @Route({
    params: z.object({ id: z.string().uuid() }),
    response: noteSchema,
    summary: 'Get a note by ID',
  })
  async show(ctx: RouterContext) {
    const note = await this.noteService.findById(ctx.param('id'))
    return ctx.json(note)
  }

  @Route({
    body: createNoteSchema,
    response: { schema: noteSchema, description: 'Created note' },
    summary: 'Create a new note',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ title: string; content: string }>()
    const note = await this.noteService.create(body)
    return ctx.json(note, 201)
  }

  @Route({
    params: z.object({ id: z.string().uuid() }),
    body: updateNoteSchema,
    response: noteSchema,
    summary: 'Update a note',
  })
  async update(ctx: RouterContext) {
    const body = await ctx.body()
    const note = await this.noteService.update(ctx.param('id'), body)
    return ctx.json(note)
  }

  @Route({
    params: z.object({ id: z.string().uuid() }),
    response: z.object({ success: z.boolean() }),
    summary: 'Delete a note',
  })
  async destroy(ctx: RouterContext) {
    await this.noteService.delete(ctx.param('id'))
    return ctx.json({ success: true })
  }
}

// --- Module ---
@Module({
  providers: [
    { provide: NOTE_TOKENS.NoteService, useClass: NoteService },
  ],
  controllers: [NotesController],
})
export class NotesModule {}
```
