import { inject } from '../di'
import { getContainer } from '../di/container-storage'
import { Transient } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import { LOGGER_TOKENS, type LoggerService } from '../logger'
import { type ConsumerRegistry } from './consumer-registry'
import type { FailedJob } from './failed-job'
import type { IQueueConsumer, QueueMessage } from './queue-consumer'
import type { QueueModuleOptions } from './queue.module'
import type { QueueStore } from './queue-store'
import { QUEUE_TOKENS } from './queue.tokens'

const DEFAULT_MAX_RETRIES = 3

@Transient(DI_TOKENS.Queue)
export class QueueManager {
  private readonly maxRetries: number

  constructor(
    @inject(DI_TOKENS.ConsumerRegistry) private readonly registry: ConsumerRegistry,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
    @inject(QUEUE_TOKENS.QueueStore) private readonly store: QueueStore,
    @inject(QUEUE_TOKENS.QueueModuleOptions) options: QueueModuleOptions,
  ) {
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  }

  async processBatch(queueName: string, batch: MessageBatch): Promise<void> {
    for (const message of batch.messages) {
      const queueMessage = message.body as QueueMessage
      const idempotencyKey = queueMessage.metadata?.idempotencyKey ?? queueMessage.id

      if (await this.store.isProcessed(idempotencyKey)) {
        message.ack()
        continue
      }

      // Resolve a fresh consumer instance per message from the active request
      // scope (handleQueue runs processBatch inside runInRequestScope), so
      // request-scoped consumer dependencies bind to this message's scope.
      const container = getContainer()
      const consumers = this.registry
        .getConsumerClasses(queueMessage.type)
        .map((ConsumerClass) => container.resolve<IQueueConsumer>(ConsumerClass))

      const results = await Promise.allSettled(
        consumers.map((consumer) => consumer.handle(queueMessage)),
      )

      let lastError: Error | undefined
      let failedConsumer: string | undefined

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'rejected') {
          const consumer = consumers[i]
          const errorInstance = result.reason instanceof Error
            ? result.reason
            : new Error(String(result.reason))

          this.logger.error('Queue message processing failed', errorInstance, {
            type: queueMessage.type,
            queue: queueName,
            messageId: queueMessage.id,
            idempotencyKey,
          })

          if (consumer.onError) {
            await consumer.onError(errorInstance, queueMessage)
          }

          lastError = errorInstance
          failedConsumer = consumer.constructor.name
        }
      }

      const failed = lastError !== undefined

      if (failed) {
        // `message.attempts` is 1-based (the first delivery is attempt 1), so a
        // message is only out of retries once it has been delivered more than
        // `maxRetries` times. `maxRetries: 3` therefore means 3 retries after the
        // initial delivery (4 total attempts). This must be <= the consumer's
        // `max_retries` in wrangler.jsonc, otherwise Cloudflare dead-letters the
        // message before this branch ever runs and it never reaches the store.
        if (message.attempts > this.maxRetries) {
          const failedJob: FailedJob = {
            id: queueMessage.id,
            queue: queueName,
            type: queueMessage.type,
            message: queueMessage,
            error: {
              name: lastError!.name,
              message: lastError!.message,
              stack: lastError!.stack,
            },
            consumer: failedConsumer!,
            attempts: message.attempts,
            failedAt: new Date().toISOString(),
          }

          // A KV failure while persisting the failed job must not abort the
          // rest of the batch — log and ack so the message isn't redelivered
          // forever.
          try {
            await this.store.storeFailedJob(failedJob)
          } catch (error) {
            this.logger.error(
              'Failed to persist failed queue job',
              error instanceof Error ? error : new Error(String(error)),
              { queue: queueName, messageId: queueMessage.id, type: queueMessage.type },
            )
          }
          message.ack()
        } else {
          message.retry()
        }
      } else {
        await this.store.markProcessed(idempotencyKey)
        message.ack()
      }
    }
  }
}
