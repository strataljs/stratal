/**
 * Dependency Injection Tokens for Email Module
 *
 * These Symbol-based tokens ensure type-safe dependency injection
 * throughout the email module and prevent naming collisions.
 */

/**
 * Email Module DI Tokens
 */
export const EMAIL_TOKENS = {
  /**
   * Email module configuration options
   */
  Options: Symbol.for('stratal:email:options'),

  /**
   * Main email service - facade for sending emails via queues
   */
  EmailService: Symbol.for('stratal:email:service'),

  /**
   * Factory for creating email provider instances based on configuration
   */
  EmailProviderFactory: Symbol.for('stratal:email:provider:factory'),

  /**
   * Email provider interface - abstracts provider implementation
   */
  EmailProvider: Symbol.for('stratal:email:provider'),

  /**
   * Queue sender for email dispatch.
   * Bound via EmailModule.forRoot({ queue: 'QUEUE_BINDING_NAME' })
   */
  EmailQueue: Symbol.for('stratal:email:queue'),
} as const
