/**
 * Queue Module
 *
 * Provides declarative queue infrastructure with provider abstraction.
 *
 * **Usage:**
 * ```typescript
 * // 1. Configure provider (once, in app root)
 * QueueModule.forRootAsync({
 *   inject: [CONFIG_TOKENS.ConfigService],
 *   useFactory: (config) => ({ provider: config.get('queue').provider })
 * })
 *
 * // 2. Register queues (queue name IS the injection token)
 * QueueModule.registerQueue('notifications-queue')
 * QueueModule.registerQueue('batch-notifications-queue')
 *
 * // 3. Inject and use
 * constructor(@InjectQueue('notifications-queue') private queue: IQueueSender) {}
 * await this.queue.dispatch({ type: 'email.send', payload: {...} })
 * ```
 *
 * **Providers:**
 * - `cloudflare`: Production provider using Cloudflare Queue bindings
 * - `sync`: Testing provider that processes messages immediately
 */

import { DI_TOKENS } from '../di/tokens'
import { Scope } from '../di/types'
import { Module } from '../module'
import type { AsyncModuleOptions, DynamicModule, InjectionToken } from '../module/types'
import { ConsumerRegistry } from './consumer-registry'
import type { QueueName } from './queue-name'
import { QueueRegistry } from './queue-registry'
import type { IQueueSender } from './queue-sender.interface'
import { QUEUE_TOKENS } from './queue.tokens'
import { QueueProviderFactory } from './services'

/**
 * Queue module configuration options
 */
export interface QueueModuleOptions {
  /**
   * Queue provider type
   * - 'cloudflare': Production provider using Cloudflare Queue bindings
   * - 'sync': Testing provider that processes messages immediately
   */
  provider: 'cloudflare' | 'sync'
}

@Module({
  providers: [
    { provide: DI_TOKENS.ConsumerRegistry, useClass: ConsumerRegistry, scope: Scope.Singleton },
    { provide: QUEUE_TOKENS.QueueProviderFactory, useClass: QueueProviderFactory, scope: Scope.Singleton },
    { provide: QUEUE_TOKENS.QueueRegistry, useClass: QueueRegistry },
  ],
})
export class QueueModule {
  /**
   * Configure queue infrastructure with async factory.
   *
   * Use when provider configuration depends on other services like ConfigService.
   *
   * @param options - Async configuration with factory and inject tokens
   * @returns Dynamic module with queue infrastructure
   *
   * @example
   * ```typescript
   * QueueModule.forRootAsync({
   *   inject: [CONFIG_TOKENS.ConfigService],
   *   useFactory: (config: IConfigService) => ({
   *     provider: config.get('queue').provider
   *   })
   * })
   * ```
   */
  static forRootAsync(options: AsyncModuleOptions<QueueModuleOptions>): DynamicModule {
    return {
      module: QueueModule,
      providers: [
        {
          provide: QUEUE_TOKENS.QueueModuleOptions,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    }
  }

  /**
   * Register a queue for injection.
   *
   * The queue name serves as both the identifier and the DI injection token.
   * Queue names are typed via module augmentation of QueueNames interface.
   *
   * @param name - Queue name (typed with autocomplete if QueueNames is augmented)
   * @returns Dynamic module that provides the queue sender
   *
   * @example
   * ```typescript
   * // In AppModule imports
   * QueueModule.registerQueue('notifications-queue')
   *
   * // Then inject using the queue name
   * constructor(@InjectQueue('notifications-queue') private queue: IQueueSender) {}
   * ```
   */
  static registerQueue(name: QueueName): DynamicModule {
    return {
      module: QueueModule,
      providers: [
        {
          provide: name as InjectionToken<IQueueSender>,
          useFactory: (registry: QueueRegistry) => registry.getQueue(name),
          inject: [QUEUE_TOKENS.QueueRegistry],
        },
      ],
    }
  }
}
