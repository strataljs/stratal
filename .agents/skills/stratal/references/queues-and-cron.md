# Queues & Cron Jobs

## QueueModule Setup

QueueModule must be configured before using queues. Each queue must be registered individually.

```typescript
import { QueueModule } from 'stratal/queue'
import { DI_TOKENS } from 'stratal/di'

@Module({
  imports: [
    QueueModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env) => ({
        provider: 'cloudflare',  // 'cloudflare' | 'sync'
      }),
    }),
    QueueModule.registerQueue('notifications-queue'),
    QueueModule.registerQueue('email-queue'),
  ],
})
export class AppModule {}
```

### Queue Name Type Safety

Auto-derive queue names from `Cloudflare.Env` bindings:

```typescript
// src/types/queues.ts
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

This converts bindings like `NOTIFICATIONS_QUEUE` to `'notifications-queue'` for typed queue name autocomplete.

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
    @InjectQueue('notifications-queue') private queue: IQueueSender,
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

## Cron Jobs

```typescript
import { Transient, inject } from 'stratal/di'
import type { CronJob } from 'stratal/cron'
import { LOGGER_TOKENS } from 'stratal/logger'

@Transient()
export class DataCleanupJob implements CronJob {
  readonly schedule = '0 2 * * *'  // Daily at 2 AM UTC

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
  readonly schedule: string                     // Cron expression
  execute(controller: ScheduledController): Promise<void>
  onError?(error: Error, controller: ScheduledController): Promise<void>
}
```
