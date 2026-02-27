# Logger Module

Production-ready logging system with multi-transport support and async processing.

## Features

- **Multi-transport architecture** - Console transport initially, extensible for Sentry/Cloudflare Analytics/HTTP/S3
- **Contextual logging** - Automatically includes request context (userId) when available
- **Async processing** - Non-blocking logging via `ctx.waitUntil()` for zero request latency impact
- **Flexible formatters** - JSON (production) and Pretty (development) formatters
- **Log level filtering** - Filter logs by severity (debug, info, warn, error)
- **Request-scoped service** - Integrates seamlessly with dependency injection

## Architecture

```
LoggerService (request-scoped)
├── Formatter (JSON | Pretty)
└── Transports[]
    ├── ConsoleTransport
    ├── SentryTransport (future)
    ├── CloudflareAnalyticsTransport (future)
    └── HttpTransport (future)
```

## Configuration

Logging is configured via `ApplicationConfig.logging` when creating the Application:

```typescript
const app = new Application(env, ctx, {
  config,
  module: AppModule,
  logging: {
    level: LogLevel.INFO,      // debug | info | warn | error
    formatter: 'json',         // json | pretty
  },
})
```

**Defaults:** `level: INFO`, `formatter: 'json'`

Environment variables (`.dev.vars`) can be used to configure logging:

```bash
# Log level: debug | info | warn | error
LOG_LEVEL=info

# Log formatter: json | pretty
LOG_FORMATTER=json
```

Parse these in your application layer and pass to `ApplicationConfig.logging`.

## Usage

### Basic Logging

```typescript
import { inject } from 'tsyringe'
import { Transient } from 'stratal'
import { LOGGER_TOKENS, type LoggerService } from 'stratal'

// Registered with scope: Scope.Singleton
@Transient()
export class UserService {
  constructor(
    @inject(LOGGER_TOKENS.LoggerService)
    private readonly logger: LoggerService
  ) {}

  async createUser(input: CreateUserInput) {
    this.logger.info('Creating user', { email: input.email })

    try {
      const user = await this.repository.create(input)
      this.logger.info('User created successfully', { userId: user.id })
      return user
    } catch (error) {
      this.logger.error('Failed to create user', error)
      throw error
    }
  }
}
```

### Log Levels

```typescript
// Debug - Development only
this.logger.debug('Processing request', { requestId: '123' })

// Info - General information
this.logger.info('User logged in', { userId: 'user_123' })

// Warn - Warning messages
this.logger.warn('Rate limit approaching', { remaining: 10 })

// Error - Error messages (accepts Error object)
this.logger.error('Operation failed', new Error('Database timeout'))

// Error with context
this.logger.error('Validation failed', { field: 'email', value: 'invalid' })
```

### Contextual Information

The logger automatically enriches logs with:

**Always included:**
- `timestamp` - Unix timestamp in milliseconds

**Request context (when available):**
- `userId` - Authenticated user ID

**Custom context:**
```typescript
this.logger.info('Payment processed', {
  orderId: 'order_123',
  amount: 49.99,
  currency: 'USD',
  gateway: 'stripe'
})
```

### Output Formats

**JSON (Production):**
```json
{"level":"info","message":"User created","timestamp":1234567890,"userId":"user_456"}
```

**Pretty (Development):**
```
[2024-01-15T10:30:45.123Z] INFO : User created
  userId: "user_456"
```

## Advanced Usage

### Queue Consumers

```typescript
import { inject } from 'tsyringe'
import { Transient } from 'stratal'
import type { QueueConsumer, QueueMessage } from 'stratal'
import { LOGGER_TOKENS, type LoggerService } from 'stratal'

// Registered via module's consumers array (defaults to Singleton scope)
@Transient()
export class EmailQueueConsumer implements QueueConsumer {
  readonly queueName = 'email-queue'
  readonly messageTypes = ['email.send']

  constructor(
    @inject(LOGGER_TOKENS.LoggerService)
    private readonly logger: LoggerService
  ) {}

  async handle(message: QueueMessage): Promise<void> {
    this.logger.info('Processing email', {
      messageId: message.id,
      recipient: message.payload.to
    })

    // Process email...
  }

  async onError(error: Error, message: QueueMessage): Promise<void> {
    this.logger.error('Email processing failed', {
      messageId: message.id,
      error: error.message,
      stack: error.stack
    })
  }
}
```

### Controllers

```typescript
import { injectable, inject } from 'tsyringe'
import { Controller, Route, type RouterContext } from 'stratal'
import { LOGGER_TOKENS, type LoggerService } from 'stratal'

@Controller('/api/v1/users', { tags: ['Users'] })
export class UsersController {
  constructor(
    @inject(LOGGER_TOKENS.LoggerService)
    private readonly logger: LoggerService
  ) {}

  @Route({
    method: 'post',
    path: '',
    body: createUserSchema,
    responses: { 201: userSchema }
  })
  async create(ctx: RouterContext): Promise<Response> {
    const body = await ctx.body<CreateUserInput>()

    this.logger.debug('Received create user request', {
      ipAddress: ctx.header('cf-connecting-ip'),
      userAgent: ctx.header('user-agent')
    })

    const user = await this.userService.create(body)
    return ctx.json(user, 201)
  }
}
```

## Performance

- **Blocking overhead**: <0.4ms per log entry (context enrichment + formatting)
- **Non-blocking writes**: Transport writes use `ctx.waitUntil()` - zero request latency impact
- **Memory efficient**: Request-scoped instances garbage collected after request
- **Log level filtering**: Filtered logs skip formatting entirely

## Best Practices

### ✅ DO

- **Use semantic log levels**
  ```typescript
  this.logger.info('User action completed')  // User-facing actions
  this.logger.debug('Cache hit', { key })    // Development debugging
  this.logger.warn('Quota exceeded', { userId })  // Potential issues
  this.logger.error('Database timeout', error)    // Actual errors
  ```

- **Include relevant context**
  ```typescript
  this.logger.info('Payment processed', {
    userId: user.id,
    orderId: order.id,
    amount: payment.amount
  })
  ```

- **Log at boundaries**
  ```typescript
  // Start of operation
  this.logger.info('Starting data import', { fileSize: file.size })

  // End of operation
  this.logger.info('Data import completed', { recordsImported: count })
  ```

- **Use error objects**
  ```typescript
  this.logger.error('Failed to send email', error)  // Includes stack trace
  ```

### ❌ DON'T

- **Over-log in hot paths**
  ```typescript
  // Bad: Logs for every iteration
  items.forEach(item => {
    this.logger.debug('Processing item', { item })
    process(item)
  })

  // Good: Log summary
  this.logger.info('Processing items', { count: items.length })
  items.forEach(process)
  this.logger.info('Items processed', { count: items.length })
  ```

- **Log sensitive data**
  ```typescript
  // Bad
  this.logger.info('User login', { password: input.password })

  // Good
  this.logger.info('User login', { email: input.email })
  ```

- **Use console directly**
  ```typescript
  // Bad
  console.log('User created')

  // Good
  this.logger.info('User created', { userId: user.id })
  ```

- **Ignore log levels**
  ```typescript
  // Bad
  this.logger.info('DEBUG: Processing request...')

  // Good
  this.logger.debug('Processing request')
  ```

## Extending with Custom Transports

Future transports can be added by implementing the `ILogTransport` interface:

```typescript
import { Transient } from 'stratal'
import { BaseTransport } from '../transports/base-transport'
import type { LogEntry } from '../contracts'

// Registered with scope: Scope.Singleton
@Transient()
export class SentryTransport extends BaseTransport {
  readonly name = 'sentry'

  async write(entry: LogEntry, formatted: string): Promise<void> {
    if (entry.level !== 'error') return // Only errors to Sentry

    try {
      await fetch(SENTRY_DSN, {
        method: 'POST',
        body: JSON.stringify({
          level: entry.level,
          message: entry.message,
          extra: entry.context,
          exception: entry.error
        })
      })
    } catch (error) {
      this.handleError(error, entry)
    }
  }
}
```

Register in `LoggerModule`:

```typescript
// Register transport
container.registerSingleton(LOGGER_TOKENS.SentryTransport, SentryTransport)

// Add to transports array
container.register(LOGGER_TOKENS.Transports, {
  useFactory: (c) => [
    c.resolve(LOGGER_TOKENS.ConsoleTransport),
    c.resolve(LOGGER_TOKENS.SentryTransport),  // Add new transport
  ]
})
```

## Troubleshooting

### Logs not appearing

**Check log level:**
```bash
# Set to debug to see all logs
LOG_LEVEL=debug
```

**Verify configuration:**
```typescript
// In any service
this.logger.info('Test log')  // Should appear
```

### Logs missing context

**Ensure request-scoped:**
- LoggerService is registered as request-scoped automatically by LoggerModule
- Context populated by middleware

### Performance issues

**Check log level in production:**
```bash
# Production should be 'info' or 'warn', not 'debug'
LOG_LEVEL=info
```

**Reduce context payload:**
```typescript
// Bad: Large objects
this.logger.info('Processing', { entireUser, entireOrder })

// Good: Relevant IDs only
this.logger.info('Processing', { userId: user.id, orderId: order.id })
```

## Related Documentation

- [Configuration](../config/README.md) - Configuration service documentation
- [I18n](../i18n/README.md) - Internationalization service
