export const QUEUE_TOKENS = {
  QueueProviderFactory: Symbol.for('stratal:queue:provider:factory'),
  QueueRegistry: Symbol.for('stratal:queue:registry'),
  QueueModuleOptions: Symbol.for('stratal:queue:options'),
  QueueStore: Symbol.for('stratal:queue:store'),
} as const

export type QueueToken = (typeof QUEUE_TOKENS)[keyof typeof QUEUE_TOKENS]
