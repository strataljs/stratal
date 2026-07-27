import { createMock, type DeepMocked } from '@stratal/testing/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from '../../di/container';
import { runWithContainer } from '../../di/container-storage';
import type { LoggerService } from '../../logger';
import type { Constructor } from '../../types';
import { ConsumerRegistry } from '../consumer-registry';
import type { IQueueConsumer, QueueMessage } from '../queue-consumer';
import { QueueManager } from '../queue-manager';
import type { QueueStore } from '../queue-store';
import type { QueueModuleOptions } from '../queue.module';

describe('QueueManager', () => {
  let queueManager: QueueManager
  let consumerRegistry: ConsumerRegistry
  let mockLogger: DeepMocked<LoggerService>
  let mockStore: DeepMocked<QueueStore>
  let instances: Map<Constructor<IQueueConsumer>, IQueueConsumer>
  let scope: Container
  const mockOptions: QueueModuleOptions = {
    provider: 'cloudflare',
    store: { binding: 'CACHE' },
    maxRetries: 3,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    consumerRegistry = new ConsumerRegistry()
    mockLogger = createMock<LoggerService>()
    mockStore = createMock<QueueStore>()
    mockStore.isProcessed.mockResolvedValue(false)
    mockStore.markProcessed.mockResolvedValue(undefined)
    mockStore.storeFailedJob.mockResolvedValue(undefined)
    mockStore.removeFailedJob.mockResolvedValue(undefined)
    instances = new Map()
    scope = {
      resolve: (token: Constructor<IQueueConsumer>) => instances.get(token),
    } as unknown as Container
    queueManager = new QueueManager(
      consumerRegistry,
      mockLogger,
      mockStore,
      mockOptions,
    )
  })

  // Register a mock consumer behind a throwaway class token and make the ambient
  // scope resolve that token to the instance (QueueManager resolves a fresh
  // consumer per message from the request scope in production).
  const register = (consumer: IQueueConsumer): void => {
    const token = class {} as unknown as Constructor<IQueueConsumer>
    instances.set(token, consumer)
    consumerRegistry.register(token, consumer.messageTypes)
  }

  const process = (queue: string, batch: MessageBatch): Promise<void> =>
    runWithContainer(scope, () => queueManager.processBatch(queue, batch))

  const createMockBatch = (messages: QueueMessage[], attempts = 1): DeepMocked<MessageBatch> => {
    const mockMessages = messages.map((body) => {
      const msg = createMock<Message>()
      ;(msg as unknown as { body: QueueMessage }).body = body
      ;(msg as unknown as { attempts: number }).attempts = attempts
      return msg
    })

    const batch = createMock<MessageBatch>()
    ;(batch as unknown as { messages: DeepMocked<Message>[] }).messages = mockMessages
    ;(batch as unknown as { queue: string }).queue = 'test-queue'
    return batch
  }

  const createConsumer = (messageTypes: string[]): DeepMocked<IQueueConsumer> => {
    const consumer = createMock<IQueueConsumer>({
      messageTypes,
    })
    consumer.handle.mockResolvedValue(undefined)
    return consumer
  }

  describe('processBatch', () => {
    it('should route messages to consumers by type', async () => {
      const consumer = createConsumer(['email.send'])
      register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: { to: 'test@example.com' } },
      ])

      await process('notifications-queue', batch)

      expect(consumer.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          type: 'email.send',
          payload: { to: 'test@example.com' },
        })
      )
    })

    it('should call ack() on successful processing', async () => {
      const consumer = createConsumer(['email.send'])
      register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ])

      await process('notifications-queue', batch)

      expect(batch.messages[0].ack).toHaveBeenCalled()
    })

    it('should call retry() and onError() on consumer failure when retries remain', async () => {
      const error = new Error('Processing failed')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(error)
      consumer.onError!.mockResolvedValue(undefined)
      register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ])

      await process('notifications-queue', batch)

      expect(consumer.onError).toHaveBeenCalledWith(error, expect.objectContaining({ id: '1' }))
      expect(batch.messages[0].retry).toHaveBeenCalled()
      expect(batch.messages[0].ack).not.toHaveBeenCalled()
      expect(mockStore.storeFailedJob).not.toHaveBeenCalled()
    })

    it('should store failed job and ack when retries exhausted', async () => {
      const error = new Error('Processing failed')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(error)
      consumer.onError!.mockResolvedValue(undefined)
      register(consumer)

      // maxRetries is 3, attempts is 1-based: delivery 4 is the first that
      // exceeds the 3-retry budget, so this is where the job is given up on.
      // The queue *name* ('background-queue-dev') deliberately differs from the
      // producer binding ('BACKGROUND_QUEUE') the message was dispatched
      // through — retry must re-enqueue via the binding, not the name.
      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {}, metadata: { binding: 'BACKGROUND_QUEUE' } },
      ], 4)

      await process('background-queue-dev', batch)

      expect(mockStore.storeFailedJob).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          queue: 'background-queue-dev',
          binding: 'BACKGROUND_QUEUE',
          error: expect.objectContaining({ message: 'Processing failed' }),
        }),
      )
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(batch.messages[0].retry).not.toHaveBeenCalled()
    })

    it('should not store a failed job when the message carries no binding metadata', async () => {
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(new Error('Processing failed'))
      consumer.onError!.mockResolvedValue(undefined)
      register(consumer)

      // A message dispatched outside Stratal has no binding to retry through.
      // The job can't be recorded for retry — log and ack, never crash the batch.
      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ], 4)

      await process('background-queue-dev', batch)

      expect(mockStore.storeFailedJob).not.toHaveBeenCalled()
      expect(mockLogger.error).toHaveBeenCalled()
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(batch.messages[0].retry).not.toHaveBeenCalled()
    })

    it('should still retry on the attempt equal to maxRetries (1-based attempts)', async () => {
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(new Error('Processing failed'))
      consumer.onError!.mockResolvedValue(undefined)
      register(consumer)

      // attempts === maxRetries (3): the 3rd delivery still has a retry left.
      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ], 3)

      await process('notifications-queue', batch)

      expect(batch.messages[0].retry).toHaveBeenCalled()
      expect(batch.messages[0].ack).not.toHaveBeenCalled()
      expect(mockStore.storeFailedJob).not.toHaveBeenCalled()
    })

    it('should handle multiple consumers for same message type', async () => {
      const consumer1 = createConsumer(['user.created'])
      const consumer2 = createConsumer(['user.created'])

      register(consumer1)
      register(consumer2)

      const batch = createMockBatch([
        { id: '1', type: 'user.created', payload: { userId: 'u1' } },
      ])

      await process('events-queue', batch)

      expect(consumer1.handle).toHaveBeenCalled()
      expect(consumer2.handle).toHaveBeenCalled()
    })

    it('should process all messages in batch', async () => {
      const consumer = createConsumer(['email.send'])
      register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: { to: 'a@example.com' } },
        { id: '2', type: 'email.send', payload: { to: 'b@example.com' } },
        { id: '3', type: 'email.send', payload: { to: 'c@example.com' } },
      ])

      await process('notifications-queue', batch)

      expect(consumer.handle).toHaveBeenCalledTimes(3)
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(batch.messages[1].ack).toHaveBeenCalled()
      expect(batch.messages[2].ack).toHaveBeenCalled()
    })

    it('should ack messages with no matching consumers', async () => {
      const consumer = createConsumer(['email.send'])
      register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'unknown.type', payload: {} },
      ])

      await process('notifications-queue', batch)

      expect(consumer.handle).not.toHaveBeenCalled()
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(mockStore.markProcessed).toHaveBeenCalledWith('1')
    })

    it('should route wildcard consumers', async () => {
      const consumer = createConsumer(['*'])
      register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'any.message.type', payload: {} },
      ])

      await process('events-queue', batch)

      expect(consumer.handle).toHaveBeenCalled()
    })

    it('should continue processing other consumers if one fails', async () => {
      const consumer1 = createConsumer(['email.send'])
      consumer1.handle.mockRejectedValue(new Error('Consumer 1 failed'))
      consumer1.onError!.mockResolvedValue(undefined)

      const consumer2 = createConsumer(['email.send'])

      register(consumer1)
      register(consumer2)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ])

      await process('notifications-queue', batch)

      expect(consumer1.handle).toHaveBeenCalled()
      expect(consumer2.handle).toHaveBeenCalled()
      expect(batch.messages[0].retry).toHaveBeenCalled()
    })

    it('should skip already-processed messages', async () => {
      mockStore.isProcessed.mockResolvedValue(true)
      const consumer = createConsumer(['email.send'])
      register(consumer)

      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {} },
      ])

      await process('notifications-queue', batch)

      expect(consumer.handle).not.toHaveBeenCalled()
      expect(batch.messages[0].ack).toHaveBeenCalled()
    })

    it('should use custom idempotencyKey from metadata', async () => {
      const consumer = createConsumer(['order.process'])
      register(consumer)

      const batch = createMockBatch([
        {
          id: '1',
          type: 'order.process',
          payload: {},
          metadata: { idempotencyKey: 'order:123' },
        },
      ])

      await process('orders-queue', batch)

      expect(mockStore.isProcessed).toHaveBeenCalledWith('order:123')
      expect(mockStore.markProcessed).toHaveBeenCalledWith('order:123')
    })

    it('should not abort the batch when persisting a failed job throws', async () => {
      mockStore.storeFailedJob.mockRejectedValue(new Error('KV down'))
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(new Error('Processing failed'))
      consumer.onError!.mockResolvedValue(undefined)
      register(consumer)

      // attempts = maxRetries + 1 (4): the failed-job path runs.
      const batch = createMockBatch([
        { id: '1', type: 'email.send', payload: {}, metadata: { binding: 'NOTIFICATIONS_QUEUE' } },
        { id: '2', type: 'email.send', payload: {}, metadata: { binding: 'NOTIFICATIONS_QUEUE' } },
      ], 4)

      await process('notifications-queue', batch)

      // Both messages still get acked despite the KV failure.
      expect(mockStore.storeFailedJob).toHaveBeenCalledTimes(2)
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(batch.messages[1].ack).toHaveBeenCalled()
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })
})
