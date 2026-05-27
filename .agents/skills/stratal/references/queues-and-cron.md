# Queues & Cron Jobs

## QueueModule Setup

Register each queue you want to inject. The string passed to `registerQueue()` is the **binding name** — it must match the `binding` field declared under `queues.producers[]` in `wrangler.jsonc` exactly (conventionally UPPER_SNAKE_CASE).

```typescript
import { QueueModule } from 'stratal/queue'
import { DI_TOKENS } from 'stratal/di'

@Module({
  imports: [
    QueueModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env) => ({
        provider: 'cloudflare',  // 'cloudflare' | 'sync'
        store: { binding: 'QUEUE_STORE' },  // KV for failed jobs + idempotency
      }),
    }),
    QueueModule.registerQueue('NOTIFICATIONS_QUEUE'),
    QueueModule.registerQueue('BACKGROUND_QUEUE'),
  ],
})
export class AppModule {}
```

The binding string does three jobs at once: DI injection token, env lookup key (`env.NOTIFICATIONS_QUEUE`), and autocomplete source. The `QueueBinding` type derives the valid set from `StratalEnv` automatically — no extra type augmentation is needed beyond `interface StratalEnv extends Cloudflare.Env {}`.

## Queue Consumer

```typescript
import { Transient, inject } from 'stratal/di'
import type { IQueueConsumer, QueueMessage } from 'stratal/queue'

interface SendEmailPayload {
  to: string
  subject: string
  html: string
}

@Transient()
export class EmailConsumer implements IQueueConsumer<SendEmailPayload> {
  readonly messageTypes = ['email.send', 'email.batch.send']

  async handle(message: QueueMessage<SendEmailPayload>): Promise<void> {
    const { to, subject, html } = message.payload
    // Process email
  }

  async onError(error: Error, message: QueueMessage<SendEmailPayload>): Promise<void> {
    // Optional error handler
  }
}
```

Register in module's `consumers` array:

```typescript
@Module({
  consumers: [EmailConsumer],
})
export class EmailModule {}
```

Consumers are matched against `message.type`, not against which queue the message arrived on. A single consumer can handle messages from any queue, and a single queue can fan messages out to many consumers — `messageTypes` is the routing key.

### Wildcard Consumer

```typescript
@Transient()
export class AuditConsumer implements IQueueConsumer {
  readonly messageTypes = ['*']  // Handles ALL message types

  async handle(message: QueueMessage): Promise<void> {
    // Log all queue activity
  }
}
```

## QueueMessage Structure

```typescript
interface QueueMessage<T = unknown> {
  id: string           // UUID (auto-generated)
  timestamp: number    // Epoch ms (auto-generated)
  type: string         // Message type for routing
  payload: T           // Message data
  metadata?: {
    locale?: string
    [key: string]: unknown
  }
}
```

## Queue Sender

### Injection

```typescript
import { InjectQueue } from 'stratal/queue'
import type { IQueueSender } from 'stratal/queue'
import { Transient } from 'stratal/di'

@Transient()
export class NotificationService {
  constructor(
    @InjectQueue('NOTIFICATIONS_QUEUE') private queue: IQueueSender,
  ) {}

  async notify(userId: string, message: string) {
    await this.queue.dispatch({
      type: 'notification.push',
      payload: { userId, message },
    })
  }
}
```

### DispatchMessage

When dispatching, `id` and `timestamp` are auto-generated:

```typescript
await this.queue.dispatch({
  type: 'email.send',
  payload: { to: 'user@example.com', subject: 'Hello' },
  metadata: { priority: 'high' },
})
```

## Wrangler Queue Configuration

```jsonc
// wrangler.jsonc
{
  "queues": {
    "producers": [
      { "queue": "notifications-queue", "binding": "NOTIFICATIONS_QUEUE" }
    ],
    "consumers": [
      { "queue": "notifications-queue", "max_batch_size": 10, "max_retries": 3 }
    ]
  }
}
```

Stratal code only references the `binding` value (`NOTIFICATIONS_QUEUE`). The `queue` value is wrangler's routing identifier and can vary per environment (e.g. `notifications-queue-dev`) without touching application code.

## QueueModuleOptions

```typescript
interface QueueModuleOptions {
  provider: 'cloudflare' | 'sync'
  store: {
    binding: string  // KV namespace binding (e.g. 'QUEUE_STORE')
  }
  idempotency?: {
    ttl?: number  // Seconds. Default: 86400 (24h)
  }
  maxRetries?: number  // Default: 3
}
```

The `store` field is required — it points to a KV namespace used for idempotency keys and failed job storage. Add the binding to `wrangler.jsonc`:

```jsonc
{
  "kv_namespaces": [
    { "binding": "QUEUE_STORE", "id": "..." }
  ]
}
```

## Failed Job Management

When a consumer throws after exhausting retries, the message is persisted to KV as a `FailedJob`.

### FailedJob Type

```typescript
interface FailedJob {
  id: string
  queue: string
  type: string
  consumer: string
  attempts: number
  failedAt: string
  message: QueueMessage
  error: { name: string; message: string; stack?: string }
}
```

### CLI Commands

```bash
# List failed jobs (default limit: 50)
npx quarry queue:failed
npx quarry queue:failed --queue=NOTIFICATIONS_QUEUE --limit=100

# Retry a single job by ID
npx quarry queue:retry <message-id>

# Retry all failed jobs
npx quarry queue:retry --all
npx quarry queue:retry --all --queue=NOTIFICATIONS_QUEUE

# Delete a single failed job
npx quarry queue:purge <message-id>

# Delete all failed jobs
npx quarry queue:purge --all
npx quarry queue:purge --all --queue=NOTIFICATIONS_QUEUE
```

### QueueStore API

Inject via `QUEUE_TOKENS.QueueStore` for programmatic access:

```typescript
import { QUEUE_TOKENS } from 'stratal/queue'
import type { QueueStore } from 'stratal/queue'

@Transient()
export class MyService {
  constructor(@inject(QUEUE_TOKENS.QueueStore) private store: QueueStore) {}

  async inspectFailures() {
    const { keys, cursor } = await this.store.listFailedJobs({ limit: 50 })
    const job = await this.store.getFailedJob(keys[0].id)
    await this.store.removeFailedJob(keys[0].id)
    await this.store.purgeFailedJobs()
  }
}
```

## Cron Jobs

Declare `schedule` as a **static** property on the class.

```typescript
import { Transient, inject } from 'stratal/di'
import type { CronJob } from 'stratal/cron'
import { LOGGER_TOKENS } from 'stratal/logger'

@Transient()
export class DataCleanupJob implements CronJob {
  static schedule = '0 2 * * *'  // Daily at 2 AM UTC

  constructor(
    @inject(LOGGER_TOKENS.LoggerService) private logger: LoggerService,
  ) {}

  async execute(controller: ScheduledController): Promise<void> {
    this.logger.info('Running data cleanup')
    // Cleanup logic
  }

  async onError(error: Error, controller: ScheduledController): Promise<void> {
    this.logger.error('Cleanup failed', { error: error.message })
  }
}
```

Register in module's `jobs` array:

```typescript
@Module({
  jobs: [DataCleanupJob],
})
export class MaintenanceModule {}
```

### Wrangler Cron Configuration

The `schedule` value MUST exactly match a trigger in `wrangler.jsonc`:

```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": ["0 2 * * *", "*/15 * * * *"]
  }
}
```

### CronJob Interface

```typescript
interface CronJob {
  execute(controller: ScheduledController): Promise<void>
  onError?(error: Error, controller: ScheduledController): Promise<void>
}
```

Declare `static schedule` on the class — it is not part of the interface. Jobs without a static `schedule` property log a warning and are skipped at boot.
