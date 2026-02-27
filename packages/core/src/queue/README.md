# Queue System

## Overview

The queue system provides **event-driven, asynchronous processing** with a declarative, type-safe API. It enables decoupling of operations from request/response cycles, supporting background tasks like sending emails, updating search indices, processing webhooks, and more.

**Key Features:**
- **Declarative queue registration** - Register queues by name, name IS the injection token
- **Type-safe queue names** - Module augmentation provides autocomplete
- **Message-type routing** - Consumers handle message types from ANY queue
- **Provider abstraction** - Cloudflare Queues (production), Sync (testing)
- **I18n integration** - Locale automatically included in messages

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                         │
│                                                                   │
│  QueueModule.forRootAsync({ provider })     // Configure provider │
│  QueueModule.registerQueue('notifications-queue')  // Register   │
│  EmailModule.forRoot({ queue: 'notifications-queue' })  // Bind  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Queue Registry                           │
│                         (Request-Scoped)                         │
│                                                                   │
│  getQueue(name) → IQueueSender                                   │
│  - Creates QueueSender bound to queue name                       │
│  - Caches per request                                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Queue Sender                             │
│                                                                   │
│  dispatch({ type, payload })                                     │
│  - Adds id, timestamp, locale                                    │
│  - Delegates to provider                                         │
└─────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ CloudflareQueueProvider │     │    SyncQueueProvider    │
│      (Production)       │     │       (Testing)         │
│                         │     │                         │
│ - Resolves CF binding   │     │ - Immediate processing  │
│ - Calls queue.send()    │     │ - Routes by messageType │
│ - Retry/DLQ support     │     │ - Fail-fast errors      │
└─────────────────────────┘     └─────────────────────────┘
              │                                 │
              └────────────────┬────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Consumer Registry                           │
│                                                                   │
│  - Indexed by messageType (not queue name!)                      │
│  - Multiple consumers can handle same type                       │
│  - Supports wildcard (*) handlers                                │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Configure Queue Module

In your application's root module, configure the provider and register queues. The queue name is also the injection token — no separate mapping needed:

```typescript
import {
  DI_TOKENS,
  EmailModule,
  Module,
  QueueModule,
  type StratalEnv,
} from 'stratal'

@Module({
  imports: [
    // Configure queue provider from environment
    QueueModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env: StratalEnv) => ({
        provider: env.ENVIRONMENT === 'test' ? 'sync' : 'cloudflare',
      }),
    }),

    // Register queues — name IS the injection token
    QueueModule.registerQueue('notifications-queue'),

    // Bind queues to modules
    EmailModule.forRoot({ queue: 'notifications-queue' }),
  ],
})
class AppModule {}
```

### 2. Type-Safe Queue Names (Optional but Recommended)

Create module augmentation for autocomplete:

```typescript
// application layer
type QueueBindingKeys = {
  [K in keyof Cloudflare.Env]: Cloudflare.Env[K] extends Queue ? K : never
}[keyof Cloudflare.Env]

type BindingToQueueName<T extends string> =
  T extends `${infer Part}_${infer Rest}`
    ? `${Lowercase<Part>}-${BindingToQueueName<Rest>}`
    : Lowercase<T>

type DerivedQueueNames = BindingToQueueName<QueueBindingKeys>

declare module 'stratal' {
  interface QueueNames extends Record<DerivedQueueNames, true> {}
}
```

Import in your app entry point for augmentation to take effect.

### 3. Send Messages

Inject queue senders with `@InjectQueue` and dispatch typed messages:

```typescript
import {
  Controller,
  InjectQueue,
  Route,
  type IController,
  type IQueueSender,
  type RouterContext,
} from 'stratal'
import { z } from 'stratal/validation'

@Controller('/api/notifications')
export class NotificationsController implements IController {
  constructor(
    @InjectQueue('notifications-queue') private readonly queue: IQueueSender,
  ) {}

  @Route({
    body: z.object({
      to: z.string().email(),
      subject: z.string(),
      body: z.string(),
    }),
    response: z.object({ queued: z.boolean() }),
    summary: 'Queue a notification',
  })
  async create(ctx: RouterContext) {
    const payload = await ctx.body<{ to: string; subject: string; body: string }>()

    await this.queue.dispatch({
      type: 'notification.send',
      payload,
    })

    return ctx.json({ queued: true }, 201)
  }
}
```

### 4. Create a Consumer

Consumers handle messages by type (not by queue). Implement `IQueueConsumer` with a typed payload and an optional `onError` hook:

```typescript
import { Transient, type IQueueConsumer, type QueueMessage } from 'stratal'

interface NotificationPayload {
  to: string
  subject: string
  body: string
}

@Transient()
export class NotificationConsumer implements IQueueConsumer<NotificationPayload> {
  readonly messageTypes = ['notification.send']

  async handle(message: QueueMessage<NotificationPayload>): Promise<void> {
    const { to, subject, body } = message.payload
    console.log(`Sending notification to ${to}: [${subject}] ${body}`)
  }

  async onError(error: Error, message: QueueMessage<NotificationPayload>): Promise<void> {
    console.error(`Failed to process notification ${message.id}:`, error)
  }
}
```

### 5. Register in Module

Wire the controller and consumer together in a feature module:

```typescript
import { Module, QueueModule } from 'stratal'
import { NotificationsController } from './notifications.controller'
import { NotificationConsumer } from './notification.consumer'

@Module({
  imports: [QueueModule.registerQueue('notifications-queue')],
  controllers: [NotificationsController],
  consumers: [NotificationConsumer],
})
export class NotificationsModule {}
```

## Core Concepts

### Queue Names as Injection Tokens

The queue name string passed to `registerQueue()` doubles as the DI token — use the same string in `@InjectQueue()` to resolve the sender.

### Message-Type Routing

Consumers declare message types, not queue names. A consumer with `messageTypes: ['email.send']` handles that message type from any queue:

```typescript
@Transient()
export class EmailConsumer implements IQueueConsumer {
  readonly messageTypes = ['email.send']

  async handle(message: QueueMessage): Promise<void> {
    // Processes 'email.send' regardless of which queue dispatched it
  }
}
```

### IQueueSender Interface

```typescript
interface IQueueSender {
  dispatch<T>(message: DispatchMessage<T>): Promise<void>
}

// Auto-generated fields: id, timestamp, metadata.locale
type DispatchMessage<T> = {
  type: string
  payload: T
  metadata?: Record<string, unknown>
}
```

### Message Structure

```typescript
interface QueueMessage<T = unknown> {
  id: string              // Auto-generated UUID
  timestamp: number       // Auto-generated
  type: string           // Message type (e.g., 'order.created')
  payload: T             // Your data
  metadata?: {
    locale?: string      // Auto-populated from I18nService
    [key: string]: unknown
  }
}
```

## Providers

### Cloudflare Queue Provider (Production)

- Resolves queue bindings from environment
- Automatic retry on failure
- Dead Letter Queue support

### Sync Provider (Testing)

- Immediate processing on `dispatch()` — messages are not queued
- Routes by message type to ConsumerRegistry
- Errors propagate to caller (fail-fast)
- `onError` hook called before error is re-thrown

## EmailModule Integration

The EmailModule uses internal tokens for queue binding:

```typescript
// In EmailModule
export const EMAIL_TOKENS = {
  EmailQueue: Symbol.for('email:Queue'),
} as const

// EmailService injects by symbol
constructor(@inject(EMAIL_TOKENS.EmailQueue) queue: IQueueSender)

// App binds symbol to queue name
EmailModule.forRoot({ queue: 'notifications-queue' })
// Internally: { provide: EMAIL_TOKENS.EmailQueue, useExisting: 'notifications-queue' }
```

For async configuration:

```typescript
EmailModule.forRootAsync({
  inject: [DI_TOKENS.CloudflareEnv],
  useFactory: (env: StratalEnv) => ({
    queue: 'notifications-queue',
    provider: env.EMAIL_PROVIDER,
  }),
})
```

## Advanced Consumer Patterns

### Multi-Type Consumer

```typescript
@Transient()
export class OrderEventsConsumer implements IQueueConsumer {
  readonly messageTypes = ['order.created', 'order.updated', 'order.cancelled']

  async handle(message: QueueMessage): Promise<void> {
    switch (message.type) {
      case 'order.created':
        await this.handleCreated(message)
        break
      case 'order.updated':
        await this.handleUpdated(message)
        break
      case 'order.cancelled':
        await this.handleCancelled(message)
        break
    }
  }
}
```

### Wildcard Consumer

```typescript
@Transient()
export class AuditLogConsumer implements IQueueConsumer {
  readonly messageTypes = ['*'] // Handles ALL message types

  async handle(message: QueueMessage): Promise<void> {
    await this.auditLog.record({
      type: message.type,
      payload: message.payload,
      timestamp: message.timestamp
    })
  }
}
```

## Testing

### Integration Testing with Sync Provider

The sync provider processes messages synchronously, executing consumers immediately when `dispatch()` is called:

```typescript
import { Test, type TestingModule } from '@stratal/testing'
import { QueueModule, DI_TOKENS, QUEUE_TOKENS, type IQueueConsumer, type ConsumerRegistry, type QueueRegistry } from 'stratal'

describe('Queue Integration', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        QueueModule.forRootAsync({
          useFactory: () => ({ provider: 'sync' })
        }),
        QueueModule.registerQueue('notifications-queue'),
      ],
    }).compile()
  })

  it('should process messages immediately', async () => {
    const handleFn = vi.fn().mockResolvedValue(undefined)
    const consumer: IQueueConsumer = {
      messageTypes: ['user.created'],
      handle: handleFn,
    }

    // Register consumer
    const registry = module.get<ConsumerRegistry>(DI_TOKENS.ConsumerRegistry)
    registry.register(consumer)

    // Dispatch within request scope
    await module.runInRequestScope(async () => {
      const queueRegistry = module.container.resolve<QueueRegistry>(QUEUE_TOKENS.QueueRegistry)
      const queueSender = queueRegistry.getQueue('notifications-queue')

      await queueSender.dispatch({
        type: 'user.created',
        payload: { userId: '123' },
      })
    })

    // Consumer was called immediately
    expect(handleFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user.created',
        payload: { userId: '123' },
      })
    )
  })
})
```

## Best Practices

### 1. Use Descriptive Message Types

```typescript
// Good - Clear, hierarchical
'user.created'
'order.shipped'
'payment.refunded'

// Bad - Vague
'created'
'update'
```

### 2. Keep Payloads Minimal

```typescript
// Good - Only IDs, fetch fresh data in consumer
await queue.dispatch({
  type: 'order.created',
  payload: { orderId: order.id }
})

// Bad - Entire entity (stale data risk)
await queue.dispatch({
  type: 'order.created',
  payload: { ...order }
})
```

### 3. Design for Idempotency

Messages may be delivered more than once:

```typescript
async handle(message: QueueMessage): Promise<void> {
  // Check if already processed
  const exists = await this.db.processedMessage.findUnique({
    where: { id: message.id }
  })
  if (exists) return

  // Process and mark as processed
  await this.processMessage(message)
  await this.db.processedMessage.create({
    data: { id: message.id }
  })
}
```

### 4. Separate Concerns with Multiple Queues

```typescript
// Good - Separate queues for different domains
'notifications-queue'    // User notifications
'analytics-queue'        // Analytics events
'email-queue'            // Email processing

// Bad - Everything in one queue
'global-queue'
```

## Wrangler Configuration

Configure queues in `wrangler.jsonc`:

```jsonc
{
  "queues": {
    "consumers": [
      {
        "queue": "notifications-queue",
        "max_retries": 3,
        "max_batch_timeout": 30,
        "max_batch_size": 10,
        "dead_letter_queue": "notifications-queue-dlq"
      }
    ],
    "producers": [
      {
        "binding": "NOTIFICATIONS_QUEUE",
        "queue": "notifications-queue"
      }
    ]
  }
}
```
