import { inject } from 'tsyringe'
import { type StratalEnv } from '../../env'
import { Transient } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import { ConsumerRegistry } from '../consumer-registry'
import { QueueProviderNotSupportedError } from '../errors'
import { CloudflareQueueProvider, SyncQueueProvider, type IQueueProvider } from '../providers'
import type { QueueModuleOptions } from '../queue.module'
import { QUEUE_TOKENS } from '../queue.tokens'

/**
 * Queue Provider Factory
 *
 * Creates the appropriate queue provider based on configuration provided
 * via QueueModule.forRootAsync().
 *
 * **Provider Selection:**
 * - `cloudflare`: Production provider using Cloudflare Queue bindings
 * - `sync`: Testing provider that processes messages immediately
 *
 * @example
 * ```typescript
 * // Configuration via QueueModule.forRootAsync()
 * QueueModule.forRootAsync({
 *   inject: [CONFIG_TOKENS.ConfigService],
 *   useFactory: (config) => ({ provider: config.get('queue').provider })
 * })
 *
 * // Factory usage (internal)
 * const factory = container.resolve(QueueProviderFactory)
 * const provider = factory.create()
 * ```
 */
@Transient(QUEUE_TOKENS.QueueProviderFactory)
export class QueueProviderFactory {
  constructor(
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv,
    @inject(DI_TOKENS.ConsumerRegistry) private readonly registry: ConsumerRegistry,
    @inject(QUEUE_TOKENS.QueueModuleOptions, { isOptional: true }) private readonly options?: QueueModuleOptions,
  ) { }

  /**
   * Create a queue provider based on module configuration
   *
   * @returns Queue provider instance
   * @throws {QueueProviderNotSupportedError} If provider type is not supported
   */
  create(): IQueueProvider {
    const providerType = this.options?.provider ?? 'cloudflare'

    switch (providerType) {
      case 'cloudflare':
        return new CloudflareQueueProvider(this.env)

      case 'sync':
        return new SyncQueueProvider(this.registry)

      default:
        throw new QueueProviderNotSupportedError(providerType)
    }
  }
}
