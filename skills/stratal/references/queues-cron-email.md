# Queues, Cron Jobs, and Email Reference

## Queue System

### QueueMessage Interface

```typescript
interface QueueMessage<T = unknown> {
  id: string            // Auto-generated UUID
  timestamp: number     // Milliseconds since epoch
  type: string          // Message type for routing to consumers
  payload: T            // Typed message payload
  metadata?: {
    locale?: string
    [key: string]: unknown
  }
}
```

### IQueueConsumer Interface

```typescript
interface IQueueConsumer<T = unknown> {
  readonly messageTypes: string[]  // Message types this consumer handles

  handle(message: QueueMessage<T>): Promise<void>

  onError?(error: Error, message: QueueMessage<T>): Promise<void>
}
```

### Creating a Consumer

```typescript
import { Transient } from 'stratal/di'
import { inject } from 'stratal/di'
import { type IQueueConsumer, type QueueMessage } from 'stratal/queue'

interface WelcomeEmailPayload {
  userId: string
  email: string
  name: string
}

@Transient()
export class WelcomeEmailConsumer implements IQueueConsumer<WelcomeEmailPayload> {
  readonly messageTypes = ['user.registered']

  constructor(
    @inject(EMAIL_TOKENS.EmailService) private readonly emailService: EmailService,
  ) {}

  async handle(message: QueueMessage<WelcomeEmailPayload>): Promise<void> {
    const { email, name } = message.payload
    await this.emailService.send({
      to: email,
      subject: `Welcome, ${name}!`,
      html: `<p>Hello ${name}, welcome to our platform.</p>`,
    })
  }

  async onError(error: Error, message: QueueMessage<WelcomeEmailPayload>): Promise<void> {
    console.error(`Failed to send welcome email to ${message.payload.email}`, error)
  }
}
```

### Registering Consumers

```typescript
@Module({
  imports: [EmailModule.forRoot(/* ... */)],
  providers: [WelcomeEmailConsumer],
  consumers: [WelcomeEmailConsumer],
})
export class NotificationsModule {}
```

### Dispatching Messages

Use `IQueueSender` to dispatch messages:

```typescript
interface DispatchMessage<T = unknown> {
  type: string          // Message type
  payload: T            // Message payload
  metadata?: {
    locale?: string
    [key: string]: unknown
  }
}

// In a service
@Transient()
export class UserService {
  constructor(
    @inject(DI_TOKENS.Queue) private readonly queue: IQueueSender,
  ) {}

  async register(data: RegisterInput) {
    const user = await this.createUser(data)

    await this.queue.dispatch({
      type: 'user.registered',
      payload: { userId: user.id, email: user.email, name: user.name },
    })

    return user
  }
}
```

### QueueModule Setup

```typescript
import { QueueModule } from 'stratal/queue'

@Module({
  imports: [
    QueueModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env) => ({
        provider: 'cloudflare',  // 'cloudflare' or 'sync' (for testing)
      }),
    }),
    QueueModule.registerQueue('notifications-queue'),  // Register named queues
  ],
})
export class AppModule {}
```

### Wrangler Queue Configuration

**Naming convention:** The binding name is derived from the queue name: `toUpperCase().replace(/-/g, '_')`. For example, queue `notifications-queue` → binding `NOTIFICATIONS_QUEUE`.

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

### CronJob Interface

```typescript
interface CronJob {
  readonly schedule: string  // Cron expression

  execute(controller: ScheduledController): Promise<void>

  onError?(error: Error, controller: ScheduledController): Promise<void>
}
```

### Creating a Cron Job

```typescript
import { Transient } from 'stratal/di'
import { inject } from 'stratal/di'
import { type CronJob } from 'stratal/cron'

@Transient()
export class DataCleanupJob implements CronJob {
  readonly schedule = '0 2 * * *'  // Daily at 2 AM UTC

  constructor(
    @inject(DI_TOKENS.Database) private readonly db: D1Database,
  ) {}

  async execute(controller: ScheduledController): Promise<void> {
    await this.db.prepare('DELETE FROM temp_data WHERE created_at < ?')
      .bind(Date.now() - 86400000)
      .run()
  }

  async onError(error: Error): Promise<void> {
    console.error('Data cleanup failed', error)
  }
}
```

### Registering Cron Jobs

```typescript
@Module({
  providers: [DataCleanupJob],
  jobs: [DataCleanupJob],
})
export class MaintenanceModule {}
```

### Wrangler Cron Configuration

```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": [
      "0 2 * * *",    // Must match job schedules
      "*/5 * * * *"
    ]
  }
}
```

## Email Module

### EmailModule Setup

**Resend provider:**

```typescript
import { EmailModule } from 'stratal/email'

EmailModule.forRoot({
  provider: 'resend',
  from: { name: 'My App', email: 'noreply@myapp.com' },
  apiKey: env.RESEND_API_KEY,
  queue: 'notifications-queue',
})
```

**SMTP provider:**

```typescript
EmailModule.forRoot({
  provider: 'smtp',
  from: { name: 'My App', email: 'noreply@myapp.com' },
  smtp: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    username: env.SMTP_USER,
    password: env.SMTP_PASS,
  },
  queue: 'notifications-queue',
})
```

**Async configuration:**

```typescript
EmailModule.forRootAsync({
  inject: [appConfig.KEY],
  useFactory: (config) => ({
    provider: config.emailProvider,
    from: { name: config.appName, email: config.fromEmail },
    apiKey: config.resendApiKey,
    queue: config.emailQueue,
  }),
})
```

### EmailModuleOptions

```typescript
interface EmailModuleOptions {
  provider: 'resend' | 'smtp'
  from: { name: string; email: string }
  apiKey?: string        // Required for Resend
  smtp?: SmtpConfig      // Required for SMTP
  replyTo?: string
  queue: string          // Queue name for async email dispatch
}

interface SmtpConfig {
  host: string
  port: number
  secure?: boolean
  username?: string
  password?: string
}
```

### Email Tokens

```typescript
import { EMAIL_TOKENS } from 'stratal/email'

EMAIL_TOKENS.Options              // EmailModuleOptions
EMAIL_TOKENS.EmailService         // EmailService
EMAIL_TOKENS.EmailProviderFactory // EmailProviderFactory
EMAIL_TOKENS.EmailProvider        // EmailProvider
EMAIL_TOKENS.EmailQueue           // Queue binding for email
```

### Required Dependencies

Resend: `npm install resend react react-dom @react-email/components`

SMTP: `npm install nodemailer`
