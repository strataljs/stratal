/**
 * Email Module
 *
 * Provides email sending capabilities with provider abstraction.
 * Supports multiple email providers (Resend, SMTP) with automatic provider selection.
 * Emails are sent asynchronously via Cloudflare Queues.
 *
 * **Usage:**
 * ```typescript
 * // In AppModule imports with static options
 * EmailModule.forRoot({
 *   provider: 'resend',
 *   apiKey: 'your-api-key',
 *   from: { name: 'App', email: 'noreply@example.com' },
 *   queue: 'notifications-queue',
 * })
 *
 * // Or with async options from config namespaces
 * EmailModule.forRootAsync({
 *   inject: [emailConfig.KEY],
 *   useFactory: (email) => ({
 *     provider: email.provider,
 *     apiKey: email.apiKey,
 *     from: email.from,
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
import type { QueueName } from '../queue'
import { QUEUE_TOKENS, QueueRegistry } from '../queue'
import { EmailConsumer } from './consumers/email.consumer'
import { EMAIL_TOKENS } from './email.tokens'
import { EmailProviderFactory, EmailService } from './services'

/**
 * SMTP configuration options
 */
export interface SmtpConfig {
  /** SMTP server host */
  host: string
  /** SMTP server port */
  port: number
  /** Use TLS */
  secure?: boolean
  /** SMTP username */
  username?: string
  /** SMTP password */
  password?: string
}

/**
 * Email module configuration options
 */
export interface EmailModuleOptions {
  /** Email provider type */
  provider: 'resend' | 'smtp'

  /** Default from address */
  from: { name: string; email: string }

  /** Resend API key (required for resend provider) */
  apiKey?: string

  /** SMTP configuration (required for smtp provider) */
  smtp?: SmtpConfig

  /** Default reply-to address */
  replyTo?: string

  /**
   * Queue name for email dispatch.
   * The queue must be registered via QueueModule.registerQueue(name).
   */
  queue: QueueName
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
   *   provider: 'resend',
   *   apiKey: env.RESEND_API_KEY,
   *   from: { name: 'App', email: 'noreply@example.com' },
   *   queue: 'notifications-queue',
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
   *     provider: email.provider,
   *     apiKey: email.apiKey,
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
        // Resolve queue from QueueRegistry using the queue name from options
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
