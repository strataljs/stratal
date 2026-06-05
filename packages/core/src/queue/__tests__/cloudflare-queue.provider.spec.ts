import { beforeEach, describe, expect, it } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { type StratalEnv } from '../../env'
import { QueueError } from '../queue.error'
import { CloudflareQueueProvider } from '../providers/cloudflare-queue.provider'
import type { QueueMessage } from '../queue-consumer'

/** Minimal stubs matching Cloudflare Workers `Queue.send` / `sendBatch` return shapes */
const mockSendResponse: QueueSendResponse = {
  metadata: {
    metrics: {
      backlogCount: 0,
      backlogBytes: 0,
    },
  },
}
const mockSendBatchResponse: QueueSendBatchResponse = {
  metadata: {
    metrics: {
      backlogCount: 0,
      backlogBytes: 0,
    },
  },
}

describe('CloudflareQueueProvider', () => {
  let provider: CloudflareQueueProvider
  let mockEnv: StratalEnv
  let mockQueue: DeepMocked<Queue>

  beforeEach(() => {
    mockQueue = createMock<Queue>()
    mockQueue.send.mockResolvedValue(mockSendResponse)
    mockQueue.sendBatch.mockResolvedValue(mockSendBatchResponse)

    mockEnv = {
      NOTIFICATIONS_QUEUE: mockQueue,
    } as unknown as StratalEnv

    provider = new CloudflareQueueProvider(mockEnv)
  })

  const createMessage = <T>(type: string, payload: T): QueueMessage<T> => ({
    id: 'test-id-123',
    type,
    payload,
  })

  describe('send', () => {
    it('should resolve binding directly on env and send message', async () => {
      const message = createMessage('email.send', { to: 'test@example.com' })

      await provider.send('NOTIFICATIONS_QUEUE', message)

      expect(mockQueue.send).toHaveBeenCalledTimes(1)
      expect(mockQueue.send).toHaveBeenCalledWith(message)
    })

    it('should throw QueueError when binding is missing', async () => {
      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        provider.send('NON_EXISTENT_BINDING', message)
      ).rejects.toThrow(QueueError)
    })

    it('should look up the binding verbatim without case or character transformation', async () => {
      const message = createMessage('email.send', { to: 'test@example.com' })

      // kebab-case input would have matched in the old kebab→UPPER_SNAKE world,
      // but the new API requires the exact binding key on env. env has
      // NOTIFICATIONS_QUEUE, not notifications-queue → must throw.
      await expect(
        provider.send('notifications-queue', message)
      ).rejects.toThrow(QueueError)

      expect(mockQueue.send).not.toHaveBeenCalled()
    })

    it('should propagate queue.send errors', async () => {
      const sendError = new Error('Queue send failed')
      mockQueue.send.mockRejectedValue(sendError)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        provider.send('NOTIFICATIONS_QUEUE', message)
      ).rejects.toThrow('Queue send failed')
    })

    it('should send message with metadata', async () => {
      const message: QueueMessage<{ to: string }> = {
        id: 'test-id-123',
        type: 'email.send',
        payload: { to: 'test@example.com' },
        metadata: {
          locale: 'en',
          priority: 'high',
        },
      }

      await provider.send('NOTIFICATIONS_QUEUE', message)

      expect(mockQueue.send).toHaveBeenCalledWith(message)
    })

  })
})
