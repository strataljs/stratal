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
  Options: Symbol.for('EmailModuleOptions'),

  /**
   * Main email service - facade for sending emails via queues
   */
  EmailService: Symbol.for('EmailService'),

  /**
   * Factory for creating email provider instances based on configuration
   */
  EmailProviderFactory: Symbol.for('EmailProviderFactory'),

  /**
   * Email provider interface - abstracts provider implementation
   */
  EmailProvider: Symbol.for('EmailProvider'),

  /**
   * Queue sender for email dispatch.
   * Bound via EmailModule.forRoot({ queue: 'queue-name' })
   */
  EmailQueue: Symbol.for('email:Queue'),
} as const
