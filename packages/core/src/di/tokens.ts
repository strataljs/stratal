/**
 * Token for the Container instance
 * Used for injecting the Container into services that need dynamic resolution
 */
export const CONTAINER_TOKEN = Symbol.for('stratal:di:container')

export const DI_TOKENS = {
  // Cloudflare
  CloudflareEnv: Symbol.for('stratal:cloudflare:env'),
  ExecutionContext: Symbol.for('stratal:execution:context'),

  // Infrastructure
  Container: CONTAINER_TOKEN,
  Application: Symbol.for('stratal:application'),
  ModuleRegistry: Symbol.for('stratal:module:registry'),
  LazyModuleLoader: Symbol.for('stratal:lazy-module-loader'),
  ExceptionHandler: Symbol.for('stratal:exception:handler'),
  Database: Symbol.for('stratal:database:service'),
  Queue: Symbol.for('stratal:queue:manager'),
  ConsumerRegistry: Symbol.for('stratal:consumer:registry'),
  Cron: Symbol.for('stratal:cron:manager'),
  EventRegistry: Symbol.for('stratal:event:registry'),
  Quarry: Symbol.for('stratal:quarry'),

  // Context
  /**
   * AuthContext: Use for services that need user authentication (userId).
   */
  AuthContext: Symbol.for('stratal:auth:context'),

  // Workers
  DurableObjectState: Symbol.for('stratal:durable:object:state'),
  DurableObjectId: Symbol.for('stratal:durable:object:id'),
} as const

export type DIToken = typeof DI_TOKENS[keyof typeof DI_TOKENS]
