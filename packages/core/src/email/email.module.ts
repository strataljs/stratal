/**
 * Email Module
 *
 * Provides email sending capabilities with provider abstraction.
 * Sends email via SMTP. Emails are dispatched asynchronously via Cloudflare Queues.
 * Emails are sent asynchronously via Cloudflare Queues.
 *
 * **Usage:**
 * ```typescript
 * // In AppModule imports with static options
 * EmailModule.forRoot({
 *   from: { name: 'App', email: 'noreply@example.com' },
 *   smtp: { url: 'smtp://user:pass@smtp.example.com:587' },
 *   queue: 'NOTIFICATIONS_QUEUE',
 * })
 *
 * // Or with async options from config namespaces
 * EmailModule.forRootAsync({
 *   inject: [emailConfig.KEY],
 *   useFactory: (email) => ({
 *     from: email.from,
 *     smtp: email.smtp,
 *     queue: email.queue,
 *   }),
 * })
 *
 * // In your service
 * @inject(EMAIL_TOKENS.EmailService)
 * private readonly emailService: EmailService
 *
 * await this.emailService.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   template: <WelcomeEmail name="John" />
 * })
 * ```
 */

import { Module } from '../module'
import type { AsyncModuleOptions, DynamicModule } from '../module/types'
import type { QueueBinding } from '../queue'
import { QUEUE_TOKENS, type QueueRegistry } from '../queue'
import { EmailConsumer } from './consumers/email.consumer'
import { EMAIL_TOKENS } from './email.tokens'
import { EmailProviderFactory, EmailService } from './services'

/**
 * SMTP configuration options
 *
 * URL format: `smtp://user:pass@host:port` or `smtps://user:pass@host:port`
 * - `smtp://` → STARTTLS on port 587 (default)
 * - `smtps://` → implicit TLS on port 465 (default)
 */
export interface SmtpConfig {
  url: string
}

/**
 * Email module configuration options
 */
export interface EmailModuleOptions {
  /** Default from address */
  from: { name: string; email: string }

  /** SMTP configuration */
  smtp: SmtpConfig

  /** Default reply-to address */
  replyTo?: string

  /**
   * Queue binding for email dispatch.
   * The binding must be registered via QueueModule.registerQueue(binding).
   */
  queue: QueueBinding
}

@Module({
  providers: [
    { provide: EMAIL_TOKENS.EmailService, useClass: EmailService },
    { provide: EMAIL_TOKENS.EmailProviderFactory, useClass: EmailProviderFactory },
  ],
  consumers: [EmailConsumer],
})
export class EmailModule {
  /**
   * Configure EmailModule with static options
   *
   * @param options - Email configuration options
   * @returns Dynamic module with email infrastructure
   *
   * @example
   * ```typescript
   * EmailModule.forRoot({
   *   from: { name: 'App', email: 'noreply@example.com' },
   *   smtp: { url: 'smtp://user:pass@smtp.example.com:587' },
   *   queue: 'NOTIFICATIONS_QUEUE',
   * })
   * ```
   */
  static forRoot(options: EmailModuleOptions): DynamicModule {
    return {
      module: EmailModule,
      providers: [
        { provide: EMAIL_TOKENS.Options, useValue: options },
        { provide: EMAIL_TOKENS.EmailQueue, useExisting: options.queue },
      ],
    }
  }

  /**
   * Configure EmailModule with async factory
   *
   * Use when configuration depends on other services.
   *
   * @param options - Async configuration with factory and inject tokens
   * @returns Dynamic module with email infrastructure
   *
   * @example
   * ```typescript
   * EmailModule.forRootAsync({
   *   inject: [emailConfig.KEY],
   *   useFactory: (email) => ({
   *     from: email.from,
   *     smtp: email.smtp,
   *     queue: email.queue,
   *   })
   * })
   * ```
   */
  static forRootAsync(options: AsyncModuleOptions<EmailModuleOptions>): DynamicModule {
    return {
      module: EmailModule,
      providers: [
        {
          provide: EMAIL_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject,
        },
        // Resolve queue from QueueRegistry using the binding from options
        {
          provide: EMAIL_TOKENS.EmailQueue,
          useFactory: (emailOptions: EmailModuleOptions, registry: QueueRegistry) =>
            registry.getQueue(emailOptions.queue),
          inject: [EMAIL_TOKENS.Options, QUEUE_TOKENS.QueueRegistry],
        },
      ],
    }
  }
}
