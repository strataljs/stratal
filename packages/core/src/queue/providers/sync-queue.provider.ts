import type { Application } from '../../application'
import type { Container } from '../../di/container'
import { containerStorage } from '../../di/container-storage'
import { inject } from '../../di'
import { Transient } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import type { RouterContext } from '../../router/router-context'
import { type ConsumerRegistry } from '../consumer-registry'
import type { IQueueConsumer, QueueMessage } from '../queue-consumer'
import type { IQueueProvider } from './queue-provider.interface'

/**
 * Sync Queue Provider
 *
 * Processes messages immediately by finding matching consumers and calling
 * their handle() method directly. Used for testing and development where
 * real queue infrastructure is not available.
 *
 * **Behavior:**
 * - Messages are processed synchronously when send() is called
 * - Matching consumers are found via ConsumerRegistry by message type
 * - All matching consumers are called sequentially
 * - Errors are re-thrown after onError() is called (fail-fast for testing)
 *
 * **Consumer Matching:**
 * - Consumers are matched by message type, not queue name
 * - Wildcard ('*') matches all message types
 */
@Transient()
export class SyncQueueProvider implements IQueueProvider {
  constructor(
    @inject(DI_TOKENS.ConsumerRegistry) private readonly registry: ConsumerRegistry,
    @inject(DI_TOKENS.Container) private readonly root: Container,
    @inject(DI_TOKENS.Application) private readonly app: Application,
  ) {}

  /**
   * Process a message synchronously.
   *
   * Runs inside the active request scope when dispatch happens within one (an
   * HTTP request, or `runInScope` for queues/cron/commands). When dispatched
   * with no ambient scope — e.g. a service invoked directly in a test — it
   * establishes its own request scope (mirroring the production queue handler)
   * so consumers and their request-scoped dependencies resolve correctly.
   *
   * @param _binding - Queue binding (not used for routing, consumers match by message type)
   * @param message - Complete message with id and payload
   * @throws Re-throws any error from consumer.handle() after calling onError()
   */
  async send<T>(_binding: string, message: QueueMessage<T>): Promise<void> {
    // The fetch path deliberately skips queue init (a Cloudflare-queue worker
    // never processes consumers inline) — but the sync provider IS the inline
    // consumer path, so populate the consumer registry before matching message
    // types. Memoized inside the application; a no-op after the first dispatch.
    await this.app.ensureScopedHandlers()

    const ambient = containerStorage.getStore()
    if (ambient) {
      await this.process(ambient, message)
      return
    }

    const locale = message.metadata?.locale ?? 'en'
    const context = {
      getLocale: () => locale,
      setLocale: () => { /* no-op */ },
      getContainer: () => containerStorage.getStore() ?? this.root,
    } as unknown as RouterContext

    await this.root.runInRequestScope(context, (container) => this.process(container, message))
  }

  /**
   * Resolve a fresh consumer per message from `container` (matched by type) and
   * invoke each sequentially, fail-fast on the first error after `onError`.
   */
  private async process<T>(container: Container, message: QueueMessage<T>): Promise<void> {
    const consumers = this.registry
      .getConsumerClasses(message.type)
      .map((ConsumerClass) => container.resolve<IQueueConsumer>(ConsumerClass))

    for (const consumer of consumers) {
      try {
        await consumer.handle(message)
      } catch (error) {
        const errorInstance = error instanceof Error ? error : new Error(String(error))

        // Call onError hook if defined
        if (consumer.onError) {
          await consumer.onError(errorInstance, message)
        }

        // Re-throw for fail-fast behavior in tests
        throw errorInstance
      }
    }
  }
}
