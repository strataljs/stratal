export const QUEUE_TOKENS = {
  QueueProviderFactory: Symbol.for('QueueProviderFactory'),
  QueueRegistry: Symbol.for('QueueRegistry'),
  QueueModuleOptions: Symbol.for('QueueModuleOptions'),
} as const

export type QueueToken = (typeof QUEUE_TOKENS)[keyof typeof QUEUE_TOKENS]
