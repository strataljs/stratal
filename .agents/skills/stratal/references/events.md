# Events

## Event Decorators

### @Listener()

Marks a class as an event listener. Auto-applies `@Transient()`.

```typescript
import { Listener, On } from 'stratal/events'

@Listener()
export class UserEventListener {
  @On('user.verified')
  async handleVerified(context: EventContext<'user.verified'>) {
    // Handle event
  }

  @On('user.created', { priority: 10, blocking: true })
  async handleCreated(context: EventContext<'user.created'>) {
    // Higher priority = executes first
    // blocking: true = awaited (not sent to waitUntil)
  }
}
```

### @On(event, options?)

Registers a method as a handler for a specific event.

Options:
- `priority?: number` — Higher values execute first (default: 0)
- `blocking?: boolean` — Force blocking behavior:
  - `before.*` events: Always blocking (true)
  - `after.*` events: Non-blocking via waitUntil (false)
  - Custom events: Blocking (true)

## Registration

Add listeners to module `providers`:

```typescript
@Module({
  providers: [UserEventListener, OrderEventListener],
})
export class AppModule {}
```

Listeners are auto-discovered from providers.

## Custom Events

### Define custom events via module augmentation:

```typescript
// src/types/events.d.ts
declare module 'stratal/events' {
  interface CustomEventRegistry {
    'user.verified': CustomEventContext<{ userId: string; email: string }>
    'email.sent': CustomEventContext<{ to: string; subject: string }>
    'order.completed': CustomEventContext<{ orderId: string; total: number }>
  }
}
```

### Emit events:

```typescript
import type { IEventRegistry } from 'stratal/events'
import { Transient, inject } from 'stratal/di'

@Transient()
export class UserService {
  constructor(
    @inject(DI_TOKENS.EventRegistry) private events: IEventRegistry,
  ) {}

  async verifyEmail(userId: string, email: string) {
    // ... verification logic
    await this.events.emit('user.verified', {
      data: { userId, email },
    })
  }
}
```

## EventRegistry API

```typescript
interface IEventRegistry {
  on(event, handler, options?): void   // Register handler
  off(event, handler): void            // Remove handler
  once(event, handler, options?): void  // One-time handler
  emit(event, context?): Promise<void> // Emit event
}
```

## Database Events

When using `@stratal/framework/database`, events are emitted before/after database operations.

### Event Name Pattern

`{phase}.{Model}.{operation}`

- Phase: `before`, `after`
- Model: PascalCase model name (e.g., `User`, `Note`)
- Operation: `create`, `update`, `delete`, `findMany`, `findFirst`, etc.

### Wildcards

- `after.User` — All operations on User model
- `after.create` — All model creates
- `before.Note.create` — Specific model + operation

### Database Event Listener

```typescript
@Listener()
export class NoteEventListener {
  @On('after.Note.create')
  async onNoteCreated(context: EventContext<'after.Note.create'>) {
    const { data, result } = context
    // data = input passed to create()
    // result = created record
  }

  @On('before.Note.delete')
  async onNoteDeleting(context: EventContext<'before.Note.delete'>) {
    // Runs before delete — can throw to prevent it
  }
}
```

### Type-Safe Database Events

Augment `CustomEventRegistry` with `DatabaseEvents`:

```typescript
import type { DatabaseEvents } from '@stratal/framework/database'

declare module 'stratal/events' {
  interface CustomEventRegistry extends DatabaseEvents {}
}
```
