import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { ConsumerRegistry } from '../consumer-registry'
import type { IQueueConsumer, QueueMessage } from '../queue-consumer'
import { QueueManager } from '../queue-manager'

describe('QueueManager', () => {
  let queueManager: QueueManager
  let consumerRegistry: ConsumerRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    consumerRegistry = new ConsumerRegistry()
    queueManager = new QueueManager(consumerRegistry)
  })

  const createMockBatch = (messages: QueueMessage[]): DeepMocked<MessageBatch> => {
    const mockMessages = messages.map((body) => {
      const msg = createMock<Message>()
      ;(msg as unknown as { body: QueueMessage }).body = body
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
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', timestamp: Date.now(), type: 'email.send', payload: { to: 'test@example.com' } },
      ])

      await queueManager.processBatch('notifications-queue', batch)

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
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', timestamp: Date.now(), type: 'email.send', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(batch.messages[0].ack).toHaveBeenCalled()
    })

    it('should call retry() and onError() on consumer failure', async () => {
      const error = new Error('Processing failed')
      const consumer = createConsumer(['email.send'])
      consumer.handle.mockRejectedValue(error)
      consumer.onError!.mockResolvedValue(undefined)
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', timestamp: Date.now(), type: 'email.send', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer.onError).toHaveBeenCalledWith(error, expect.objectContaining({ id: '1' }))
      expect(batch.messages[0].retry).toHaveBeenCalled()
    })

    it('should handle multiple consumers for same message type', async () => {
      const consumer1 = createConsumer(['user.created'])
      const consumer2 = createConsumer(['user.created'])

      consumerRegistry.register(consumer1)
      consumerRegistry.register(consumer2)

      const batch = createMockBatch([
        { id: '1', timestamp: Date.now(), type: 'user.created', payload: { userId: 'u1' } },
      ])

      await queueManager.processBatch('events-queue', batch)

      expect(consumer1.handle).toHaveBeenCalled()
      expect(consumer2.handle).toHaveBeenCalled()
    })

    it('should process all messages in batch', async () => {
      const consumer = createConsumer(['email.send'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', timestamp: Date.now(), type: 'email.send', payload: { to: 'a@example.com' } },
        { id: '2', timestamp: Date.now(), type: 'email.send', payload: { to: 'b@example.com' } },
        { id: '3', timestamp: Date.now(), type: 'email.send', payload: { to: 'c@example.com' } },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer.handle).toHaveBeenCalledTimes(3)
      expect(batch.messages[0].ack).toHaveBeenCalled()
      expect(batch.messages[1].ack).toHaveBeenCalled()
      expect(batch.messages[2].ack).toHaveBeenCalled()
    })

    it('should skip messages with no matching consumers', async () => {
      const consumer = createConsumer(['email.send'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', timestamp: Date.now(), type: 'unknown.type', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer.handle).not.toHaveBeenCalled()
    })

    it('should route wildcard consumers', async () => {
      const consumer = createConsumer(['*'])
      consumerRegistry.register(consumer)

      const batch = createMockBatch([
        { id: '1', timestamp: Date.now(), type: 'any.message.type', payload: {} },
      ])

      await queueManager.processBatch('events-queue', batch)

      expect(consumer.handle).toHaveBeenCalled()
    })

    it('should continue processing other consumers if one fails', async () => {
      const consumer1 = createConsumer(['email.send'])
      consumer1.handle.mockRejectedValue(new Error('Consumer 1 failed'))
      consumer1.onError!.mockResolvedValue(undefined)

      const consumer2 = createConsumer(['email.send'])

      consumerRegistry.register(consumer1)
      consumerRegistry.register(consumer2)

      const batch = createMockBatch([
        { id: '1', timestamp: Date.now(), type: 'email.send', payload: {} },
      ])

      await queueManager.processBatch('notifications-queue', batch)

      expect(consumer1.handle).toHaveBeenCalled()
      expect(consumer2.handle).toHaveBeenCalled()
    })
  })
})
