# stratal

A modular Cloudflare Workers framework with automatic OpenAPI documentation, dependency injection, queue consumers, cron jobs, and type-safe configuration.

For full documentation and examples, see the [main README](../../README.md).

## Features

- Automatic OpenAPI 3.0 spec generation with Scalar docs UI from Zod schemas
- Two-tier dependency injection (global + request-scoped) via tsyringe
- NestJS-style modular architecture with lifecycle hooks and dynamic modules
- Convention-based Hono routing with auto-derived HTTP methods and status codes
- Typed Cloudflare Queue consumers and cron job scheduling
- S3-compatible storage, email (Resend/SMTP), and type-safe i18n
- Route guards, middleware, and environment type augmentation

## Installation

```bash
npm install stratal
# or
yarn add stratal
```

### Optional dependencies

Stratal keeps heavy integrations optional. Install only what you need:

```bash
# Storage (S3-compatible)
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner

# Email (Resend provider)
npm install resend react react-dom @react-email/components

# Email (SMTP provider)
npm install nodemailer

# File uploads (TUS protocol)
npm install @tus/server
```

## Sub-path Exports

Import specific modules for better tree-shaking:

```typescript
import { Application, OpenAPIModule } from 'stratal' // Core + OpenAPI docs
import { Container } from 'stratal/di'               // DI container
import { RouterService } from 'stratal/router'       // Routing
import { z } from 'stratal/validation'                // Zod + OpenAPI
import { ApplicationError } from 'stratal/errors'     // Error types
import { I18nModule } from 'stratal/i18n'             // Internationalization
import { CacheModule } from 'stratal/cache'           // Caching
import { LoggerService } from 'stratal/logger'        // Logging
```

## License

MIT
