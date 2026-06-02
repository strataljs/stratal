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

import { DI_TOKENS } from '../di/tokens';
import { type StratalEnv } from '../env';
import { Module } from '../module';
import type {
  AsyncModuleOptions,
  DynamicModule,
  InjectionToken,
  ModuleContext,
  OnInitialize,
} from '../module/types';
import { ConsumerRegistry } from './consumer-registry';
import type { QueueBinding } from './queue-binding';
import { QueueManager } from './queue-manager';
import { QueueRegistry } from './queue-registry';
import type { IQueueSender } from './queue-sender.interface';
import { QueueError } from './queue.error';
import { DEFAULT_STORE_BINDING, QueueStore } from './queue-store';
import { QUEUE_TOKENS } from './queue.tokens';
import { QueueProviderFactory } from './services';

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

  /**
   * KV binding for queue state (idempotency keys + failed jobs).
   * Defaults to the `CACHE` binding if omitted.
   */
  store?: {
    /** KV namespace binding name.`
     * @default CACHE
     */
    binding?: string
  }

  /**
   * Idempotency configuration.
   *
   * Messages are auto-idempotent: every dispatch carries an idempotency key
   * (an explicit `metadata.idempotencyKey`, otherwise a deterministic SHA-256
   * hash of `type` + `payload`), and a message that has already been processed
   * is skipped. `ttl` bounds how long processed keys are remembered.
   */
  idempotency?: {
    /** TTL in seconds for processed idempotency keys. Default: 86400 (24h) */
    ttl?: number
  }

  /**
   * Failed-job configuration.
   *
   * Failed jobs persist indefinitely until retried or purged. To bound growth,
   * register the opt-in `FailedJobCleanupJob` cron in a module's `jobs` array;
   * it deletes failed jobs older than `retention`.
   */
  failedJobs?: {
    /**
     * Age in seconds beyond which `FailedJobCleanupJob` deletes a failed job.
     * Default: 604800 (7d). Has no effect unless the cron is registered.
     */
    retention?: number
  }

  /** Max retry attempts before storing as failed job. Default: 3 */
  maxRetries?: number
}

@Module({
  providers: [
    { provide: DI_TOKENS.ConsumerRegistry, useClass: ConsumerRegistry },
    QueueManager,
    { provide: QUEUE_TOKENS.QueueProviderFactory, useClass: QueueProviderFactory },
    { provide: QUEUE_TOKENS.QueueRegistry, useClass: QueueRegistry },
    { provide: QUEUE_TOKENS.QueueStore, useClass: QueueStore },
  ],
})
export class QueueModule implements OnInitialize {
  /**
   * Fail fast at boot if the configured KV store binding is missing, rather
   * than letting every queue invocation hard-fail lazily. The binding backs
   * idempotency claims and failed-job storage, so without it the queue
   * subsystem cannot function.
   */
  onInitialize({ container }: ModuleContext): void {
    const options = container.resolve<QueueModuleOptions>(QUEUE_TOKENS.QueueModuleOptions)

    // Only the `cloudflare` provider persists idempotency claims and failed jobs
    // to KV. The `sync` provider (dev/CLI) processes inline and never touches the
    // store, so it must not require the binding.
    if (options.provider !== 'cloudflare') return

    const binding = options.store?.binding ?? DEFAULT_STORE_BINDING
    const env = container.resolve<StratalEnv>(DI_TOKENS.CloudflareEnv)
    const kv = (env as unknown as Record<string, unknown>)[binding]

    if (!kv) {
      throw new QueueError(
        `Queue KV store binding "${binding}" was not found in the environment. ` +
          `The queue subsystem persists idempotency claims and failed jobs to KV. ` +
          `Add a kv_namespaces entry for "${binding}" in wrangler.jsonc, or set ` +
          `QueueModule.forRootAsync({ ..., store: { binding: 'YOUR_KV' } }) to point at an existing namespace.`,
      )
    }
  }

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
