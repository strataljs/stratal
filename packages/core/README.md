# stratal

A modular Cloudflare Workers framework with dependency injection, queue-based events, and type-safe configuration.

For full documentation and examples, see the [main README](../../README.md).

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
import { Application } from 'stratal'           // Core
import { Container } from 'stratal/di'           // DI container
import { RouterService } from 'stratal/router'   // Routing
import { z } from 'stratal/validation'            // Zod + OpenAPI
import { ApplicationError } from 'stratal/errors' // Error types
import { I18nModule } from 'stratal/i18n'         // Internationalization
import { CacheModule } from 'stratal/cache'       // Caching
import { LoggerService } from 'stratal/logger'    // Logging
```

## License

MIT
