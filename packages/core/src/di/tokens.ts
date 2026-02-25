/**
 * Token for the Container instance
 * Used for injecting the Container into services that need dynamic resolution
 */
export const CONTAINER_TOKEN = Symbol.for('di:Container')

export const DI_TOKENS = {
  // Cloudflare
  CloudflareEnv: Symbol.for('CloudflareEnv'),
  ExecutionContext: Symbol.for('ExecutionContext'),

  // Infrastructure
  Container: CONTAINER_TOKEN,
  Application: Symbol.for('Application'),
  ModuleRegistry: Symbol.for('ModuleRegistry'),
  ErrorHandler: Symbol.for('ErrorHandler'),
  ConnectionManager: Symbol.for('ConnectionManager'),
  Database: Symbol.for('DatabaseService'),
  Queue: Symbol.for('QueueManager'),
  ConsumerRegistry: Symbol.for('ConsumerRegistry'),
  Cron: Symbol.for('CronManager'),
  EventRegistry: Symbol.for('EventRegistry'),

  // Context
  /**
   * AuthContext: Use for services that need user authentication (userId).
   */
  AuthContext: Symbol.for('AuthContext'),
} as const

export type DIToken = typeof DI_TOKENS[keyof typeof DI_TOKENS]
