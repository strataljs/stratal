import { inject } from 'tsyringe';
import { Transient } from '../di/decorators';
import { DI_TOKENS } from '../di/tokens';
import { LOGGER_TOKENS, type LoggerService } from '../logger';
import { type ConsumerRegistry } from './consumer-registry';
import type { QueueMessage } from './queue-consumer';

@Transient(DI_TOKENS.Queue)
export class QueueManager {
  constructor(
    @inject(DI_TOKENS.ConsumerRegistry) private readonly registry: ConsumerRegistry,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
  ) {}

  async processBatch(queueName: string, batch: MessageBatch): Promise<void> {
    for (const message of batch.messages) {
      const queueMessage = message.body as QueueMessage

      const consumers = this.registry.getConsumers(queueMessage.type)

      for (const consumer of consumers) {
        try {
          await consumer.handle(queueMessage)
          message.ack()
        } catch (error) {
          const errorInstance = error instanceof Error
            ? error
            : new Error(String(error))

          this.logger.error('Queue message processing failed', errorInstance, {
            type: queueMessage.type,
            queue: queueName,
          })

          if (consumer.onError) {
            await consumer.onError(errorInstance, queueMessage)
          }
          message.retry()
        }
      }
    }
  }
}
