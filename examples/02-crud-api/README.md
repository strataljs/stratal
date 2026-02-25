# 02 - CRUD API

A RESTful notes API with Zod validation, multiple routes, and a service layer.

## What it demonstrates

- Feature modules with `@Module({ providers, controllers })`
- All CRUD operations via `IController` methods (`index`, `show`, `create`, `update`, `destroy`)
- Auto-derived HTTP methods from method names (e.g. `create` -> `POST`, `destroy` -> `DELETE`)
- Zod schemas for `body`, `params`, and `response` validation via `@Route()`
- Constructor-based dependency injection with `@Transient()`

## Running

```bash
cd examples/02-crud-api
npx wrangler dev
```

## API endpoints

| Method | Path             | Description      |
|--------|------------------|------------------|
| GET    | /api/notes       | List all notes   |
| POST   | /api/notes       | Create a note    |
| GET    | /api/notes/:id   | Get a note       |
| PUT    | /api/notes/:id   | Update a note    |
| DELETE | /api/notes/:id   | Delete a note    |

## Example requests

```bash
# Create a note
curl -X POST http://localhost:8787/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"title": "My Note", "content": "Hello from Stratal"}'

# List all notes
curl http://localhost:8787/api/notes

# Get a note
curl http://localhost:8787/api/notes/<id>

# Update a note
curl -X PUT http://localhost:8787/api/notes/<id> \
  -H 'Content-Type: application/json' \
  -d '{"title": "Updated Title"}'

# Delete a note
curl -X DELETE http://localhost:8787/api/notes/<id>
```

## Key files

- [`src/notes/notes.module.ts`](src/notes/notes.module.ts) - Feature module
- [`src/notes/notes.controller.ts`](src/notes/notes.controller.ts) - CRUD controller
- [`src/notes/notes.service.ts`](src/notes/notes.service.ts) - In-memory data service
- [`src/notes/notes.schemas.ts`](src/notes/notes.schemas.ts) - Zod validation schemas
