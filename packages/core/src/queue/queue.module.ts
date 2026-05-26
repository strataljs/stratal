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
 * // 2. Register queue bindings (the binding IS the injection token)
 * QueueModule.registerQueue('NOTIFICATIONS_QUEUE')
 * QueueModule.registerQueue('BACKGROUND_QUEUE')
 *
 * // 3. Inject and use
 * constructor(@InjectQueue('NOTIFICATIONS_QUEUE') private queue: IQueueSender) {}
 * await this.queue.dispatch({ type: 'email.send', payload: {...} })
 * ```
 *
 * **Providers:**
 * - `cloudflare`: Production provider using Cloudflare Queue bindings
 * - `sync`: Testing provider that processes messages immediately
 */

import { DI_TOKENS } from '../di/tokens'
import { Module } from '../module'
import type { AsyncModuleOptions, DynamicModule, InjectionToken } from '../module/types'
import { ConsumerRegistry } from './consumer-registry'
import type { QueueBinding } from './queue-binding'
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
    { provide: DI_TOKENS.ConsumerRegistry, useClass: ConsumerRegistry },
    { provide: QUEUE_TOKENS.QueueProviderFactory, useClass: QueueProviderFactory },
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
   * Register a queue binding for injection.
   *
   * The binding name doubles as the DI injection token and the
   * `env`-lookup key. Binding names are typed against `StratalEnv`
   * (autocomplete works once an app augments `StratalEnv` with its
   * Cloudflare bindings).
   *
   * @param binding - Queue binding identifier (e.g. `NOTIFICATIONS_QUEUE`).
   * @returns Dynamic module that provides the queue sender
   *
   * @example
   * ```typescript
   * // In AppModule imports
   * QueueModule.registerQueue('NOTIFICATIONS_QUEUE')
   *
   * // Then inject using the binding name
   * constructor(@InjectQueue('NOTIFICATIONS_QUEUE') private queue: IQueueSender) {}
   * ```
   */
  static registerQueue(binding: QueueBinding): DynamicModule {
    return {
      module: QueueModule,
      providers: [
        {
          provide: binding as InjectionToken<IQueueSender>,
          useFactory: (registry: QueueRegistry) => registry.getQueue(binding),
          inject: [QUEUE_TOKENS.QueueRegistry],
        },
      ],
    }
  }
}
