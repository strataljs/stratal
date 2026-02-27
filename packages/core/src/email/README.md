# Email Module

Comprehensive email service with provider abstraction and async queue processing.

## Overview

The Email Module provides a unified interface for sending emails across the application with automatic provider selection and asynchronous processing via Cloudflare Queues.

**Key Features:**
- 📧 **Provider Abstraction** - Supports multiple email providers (Resend, SMTP)
- 🔄 **Async Processing** - Non-blocking email sending via Cloudflare Queues
- 🌍 **Auto Locale Injection** - Automatic locale detection from request context
- ⚡ **Type-Safe** - Full TypeScript support with Zod schema validation
- 🔌 **Extensible** - Easy to add new email providers

## Architecture

### Components

```
email/
├── contracts/          # Zod schemas & types
├── providers/          # Provider implementations
│   ├── base-email.provider.ts        # Shared batch logic
│   ├── email-provider.interface.ts
│   ├── resend.provider.ts
│   └── smtp.provider.ts
├── services/
│   ├── email.service.ts              # Main service (facade)
│   └── email-provider-factory.ts     # Provider selector
├── consumers/          # Queue processors
│   └── email.consumer.ts
└── errors/            # Focused error classes
    ├── resend-api-key-missing.error.ts
    ├── smtp-configuration-missing.error.ts
    ├── smtp-host-missing.error.ts
    ├── email-smtp-connection-failed.error.ts
    ├── email-resend-api-failed.error.ts
    └── email-provider-not-supported.error.ts
```

### Request-Scoped Service

**EmailService is request-scoped** (registered with `scope: Scope.Request`) to ensure proper isolation across concurrent requests.

**Why Request-Scoped?**

- ✅ **Request Isolation:** Each request gets its own EmailService instance
- ✅ **Thread Safety:** Eliminates potential race conditions in concurrent request handling
- ✅ **Consistency:** Matches pattern used by DatabaseService and I18nService
- ✅ **Locale-Aware Routing:** Can access I18nService for locale-specific queue metadata

**Implementation:**
```typescript
import { Transient, EMAIL_TOKENS, Scope } from 'stratal'

// Service class
@Transient(EMAIL_TOKENS.EmailService)
export class EmailService { }

// Registration in module
{ provide: EMAIL_TOKENS.EmailService, useClass: EmailService, scope: Scope.Request }
```

**Note:** The `@Transient()` decorator marks the class as injectable. Scope is specified at registration time via `scope: Scope.Request`. EmailService gets request context via its injected dependencies (I18nService).

**EmailProviderFactory remains a singleton** since it has no request dependencies and creates providers on demand.

Request scoping ensures each HTTP request gets its own service instance, preventing shared state across concurrent requests.

### Flow Diagram

```
Application Code
      ↓
EmailService.send()
      ↓
[NOTIFICATIONS_QUEUE]
      ↓
EmailConsumer
      ↓
EmailProviderFactory
      ↓
Provider (Resend/SMTP)
      ↓
Email Sent
```

## Configuration

### Module Registration

Register the email module in your application using `EmailModule.forRoot()` (static options) or `EmailModule.forRootAsync()` (factory pattern):

**Static options:**
```typescript
import { EmailModule } from 'stratal'

EmailModule.forRoot({
  provider: 'resend',
  apiKey: env.RESEND_API_KEY,
  from: { name: 'My App', email: 'noreply@example.com' },
  replyTo: 'support@example.com',
  queue: 'notifications-queue',
})
```

**Async factory (e.g. from a config namespace):**
```typescript
import { EmailModule } from 'stratal'

EmailModule.forRootAsync({
  inject: [emailConfig.KEY],
  useFactory: (email) => ({
    provider: email.provider,
    apiKey: email.apiKey,
    from: email.from,
    smtp: email.smtp,
    queue: email.queue,
  }),
})
```

### EmailModuleOptions

| Field      | Type                            | Required | Description                                          |
|------------|---------------------------------|----------|------------------------------------------------------|
| `provider` | `'resend' \| 'smtp'`           | Yes      | Email provider type                                  |
| `from`     | `{ name: string; email: string }` | Yes   | Default sender address                               |
| `queue`    | `QueueName`                     | Yes      | Queue name for async dispatch                        |
| `apiKey`   | `string`                        | No       | Resend API key (required when `provider` is `resend`) |
| `smtp`     | `SmtpConfig`                    | No       | SMTP settings (required when `provider` is `smtp`)   |
| `replyTo`  | `string`                        | No       | Default reply-to address                             |

### SmtpConfig

| Field      | Type      | Required | Description       |
|------------|-----------|----------|-------------------|
| `host`     | `string`  | Yes      | SMTP server host  |
| `port`     | `number`  | Yes      | SMTP server port  |
| `secure`   | `boolean` | No       | Use TLS           |
| `username` | `string`  | No       | SMTP username     |
| `password` | `string`  | No       | SMTP password     |

### Provider Selection Logic

The [EmailProviderFactory](services/email-provider-factory.ts) automatically selects the provider based on `options.provider`:

- `smtp` → [SmtpProvider](providers/smtp.provider.ts) (via nodemailer)
- `resend` → [ResendProvider](providers/resend.provider.ts)

See [Adding a New Provider](#adding-a-new-provider) to extend with additional providers.

## Usage

### Dependency Injection

Inject `EmailService` using the `EMAIL_TOKENS.EmailService` token:

See [email.tokens.ts](email.tokens.ts) for all available tokens.

### Available Methods

**EmailService** provides two main methods:

1. **`send(input: SendEmailInput)`** - Send a single email asynchronously
2. **`sendBatch(input: SendEmailBatchInput)`** - Send multiple emails asynchronously

Both methods queue emails for background processing and return immediately.

### Email Message Structure

See [contracts/email-message.contract.ts](contracts/email-message.contract.ts) for the complete message schema.

**Supported fields:**
- `to` (required) - Recipient email(s)
- `subject` (required) - Email subject
- `html` / `text` - Email content
- `from` - Custom sender (optional)
- `replyTo` - Reply-to address (optional)
- `cc` / `bcc` - Carbon copy recipients (optional)
- `attachments` - File attachments (optional) - supports two formats:
  - **Inline:** `{ filename, content (base64), contentType }`
  - **Storage-based:** `{ filename, storageKey, disk? }` - resolved by consumer from storage

Storage-based attachments are recommended for large files to avoid queue message size limits.
See [contracts/email-attachment.ts](contracts/email-attachment.ts) for attachment schema.

### Implementation Examples

For queue processing implementation, see [Consumers](consumers/).

## Queue Processing

### Queue Configuration

Defined in your application's `wrangler.jsonc`:

```jsonc
{
  "queues": {
    "consumers": [
      {
        "queue": "notifications-queue",
        "max_batch_size": 50,
        "max_retries": 3
      }
    ]
  }
}
```

### Retry Logic

- **Max Retries:** 3 attempts
- **Retry Behavior:** Automatic exponential backoff via Cloudflare Queues
- **Error Handling:** Logged via Logger service
- **Failed Messages:** Available in Dead Letter Queue for manual inspection

## Adding a New Provider

To add a new email provider:

### 1. Create Provider Implementation

- Extend [BaseEmailProvider](providers/base-email.provider.ts) abstract class
- Implement the `send()` method
- Batch sending is inherited automatically from base class
- Use [IEmailProvider](providers/email-provider.interface.ts) interface as reference
- Follow patterns in [ResendProvider](providers/resend.provider.ts) or [SmtpProvider](providers/smtp.provider.ts)

### 2. Update Provider Factory

- Add new case to [EmailProviderFactory](services/email-provider-factory.ts)
- Inject ConfigService for provider configuration

### 3. Update Configuration Schema

- Add provider name to enum in configuration schema
- See [ConfigService](../config/README.md) for schema updates

### 4. Create Focused Error Classes

- Create specific error classes for provider failures
- Follow patterns in [errors/](errors/) directory
- Add i18n messages to `packages/core/src/i18n/messages/{locale}/errors.ts`

## Error Handling

The module uses focused error classes that extend `ApplicationError`. Each error class represents a specific scenario:

### Configuration Errors
- **[ResendApiKeyMissingError](errors/resend-api-key-missing.error.ts)** - Resend API key not configured
- **[SmtpConfigurationMissingError](errors/smtp-configuration-missing.error.ts)** - SMTP configuration not provided
- **[SmtpHostMissingError](errors/smtp-host-missing.error.ts)** - SMTP `host` missing from `SmtpConfig`
- **[EmailProviderNotSupportedError](errors/email-provider-not-supported.error.ts)** - Unsupported provider configured

### Runtime Errors
- **[EmailSmtpConnectionFailedError](errors/email-smtp-connection-failed.error.ts)** - SMTP server connection failed
- **[EmailResendApiFailedError](errors/email-resend-api-failed.error.ts)** - Resend API returned error

All error messages are internationalized via `packages/core/src/i18n/messages/{locale}/errors.ts`.

## Testing

### Local Testing with Mailpit

The project includes Mailpit in `docker-compose.yml` for SMTP testing:

```bash
# Start Mailpit
docker compose up -d

# View emails at: http://localhost:8025
```

Configure the SMTP provider to point at Mailpit:

```typescript
EmailModule.forRoot({
  provider: 'smtp',
  smtp: { host: 'localhost', port: 1035 },
  from: { name: 'App', email: 'noreply@example.com' },
  queue: 'notifications-queue',
})
```

### Testing with Resend

Use Resend's sandbox mode for development by passing a sandbox API key:

```typescript
EmailModule.forRoot({
  provider: 'resend',
  apiKey: 're_sandbox_...',
  from: { name: 'App', email: 'noreply@example.com' },
  queue: 'notifications-queue',
})
```

Sandbox emails are not actually sent but appear in Resend dashboard.

## Integration Examples

## Performance Considerations

### Async Processing Benefits

- **Non-blocking:** API responses return immediately
- **Scalable:** Queue consumers process independently
- **Resilient:** Automatic retries on failures
- **Observable:** Queue metrics available in Cloudflare dashboard

### Queue Message Size

- **Limit:** 128 KB per message (Cloudflare Queues)
- **Attachments:** Two options for handling large attachments:
  - **Storage-based:** Use `storageKey` field - consumers resolve from storage just-in-time
  - **Inline:** Use `content` field with base64 encoding (for small files only)

## Security

### Email Validation

All email addresses are validated via Zod schemas before queueing.

### SMTP Authentication

SMTP credentials are never logged and only accessible via ConfigService.

## Monitoring & Logging

All email operations are logged via the Logger service with PII-free metadata:

```typescript
// Processing
logger.info('Processing email message', {
  type, recipientCount, hasHtml, hasText, hasAttachments
})

// Success
logger.info('Email sent successfully', { messageId, recipientCount })

// Failure
logger.error('Failed to send email', { error, recipientCount })
```

**Privacy Note:** Email addresses are never logged to comply with GDPR. Only metadata like `recipientCount` is included.

See [EmailConsumer](consumers/email.consumer.ts) for the consumer implementation.

## Troubleshooting

### SMTP Connection Issues

```bash
# Test SMTP connection
nc -zv smtp.example.com 587
```

Verify your `SmtpConfig` object includes the correct `host` and `port`:

```typescript
smtp: { host: 'smtp.example.com', port: 587, secure: true, username: '...', password: '...' }
```

### Resend API Errors

Verify the `apiKey` value passed to `EmailModuleOptions` is valid and check the [Resend dashboard](https://resend.com/dashboard) for quota or rate-limit issues.

### Queue Processing Delays

Check Cloudflare dashboard:
- Queue depth
- Consumer lag
- Failed messages

## Related Documentation

- [Queue System](../queue/README.md)
- [Configuration Service](../config/README.md)
