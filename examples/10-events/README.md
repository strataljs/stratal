# 10 - Events

Type-safe event system with `@Listener` and `@On` decorators for application-level side effects.

## What it demonstrates

- `CustomEventRegistry` module augmentation for type-safe event names and contexts
- `@Listener()` decorator to mark classes as event listeners (auto-discovered from module providers)
- `@On(eventName, options?)` decorator to register methods as event handlers
- `EventRegistry` injection and `emit()` from services
- Multiple listeners reacting to the same events
- `priority` option for handler execution order (higher = runs first)
- `CustomEventContext<TData>` for typed event payloads
- Purpose-built listeners for notifications, search indexing, and webhooks

## Running

```bash
cd examples/10-events
npm install
npx wrangler dev
```

## API endpoints

| Method | Path             | Description                    |
|--------|------------------|--------------------------------|
| GET    | /api/notes       | List all notes                 |
| POST   | /api/notes       | Create a note (emits events)   |
| GET    | /api/notes/:id   | Get a note                     |
| PUT    | /api/notes/:id   | Update a note (emits events)   |
| DELETE | /api/notes/:id   | Delete a note (emits event)    |
| GET    | /api/stats       | View event dispatch counters   |

## Events

| Event Name       | Emitted When                        | Payload                                    |
|------------------|-------------------------------------|--------------------------------------------|
| `note.notify`    | After create — notify collaborators | `{ noteId, title, recipientId }`           |
| `note.index`     | After create/update — rebuild search index | `{ noteId, title, content, operation }` |
| `note.webhook`   | After any mutation — dispatch to external integrations | `{ noteId, event, timestamp }` |

## Example requests

```bash
# Create a note — triggers note.notify, note.index, note.webhook
curl -X POST http://localhost:8787/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"title": "My Note", "content": "Hello from Stratal"}'

# Update a note — triggers note.index, note.webhook
curl -X PUT http://localhost:8787/api/notes/<id> \
  -H 'Content-Type: application/json' \
  -d '{"title": "Updated Title"}'

# Delete a note — triggers note.webhook
curl -X DELETE http://localhost:8787/api/notes/<id>

# Check event dispatch counters
curl http://localhost:8787/api/stats
```

Watch the wrangler console to see `[Notification]`, `[SearchIndex]`, and `[Stats]` log output from the listeners.

## Key files

- [`src/types/events.ts`](src/types/events.ts) - `CustomEventRegistry` augmentation with custom event types
- [`src/notes/notes.service.ts`](src/notes/notes.service.ts) - Emits events via `EventRegistry`
- [`src/listeners/notification.listener.ts`](src/listeners/notification.listener.ts) - Handles `note.notify` with priority 10
- [`src/listeners/search-index.listener.ts`](src/listeners/search-index.listener.ts) - Handles `note.index` for search rebuilds
- [`src/listeners/stats.listener.ts`](src/listeners/stats.listener.ts) - Tracks dispatch counts across all events
- [`src/listeners/listeners.module.ts`](src/listeners/listeners.module.ts) - Provides listeners for auto-discovery
