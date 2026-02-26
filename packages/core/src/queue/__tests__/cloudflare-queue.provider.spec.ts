import { beforeEach, describe, expect, it } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { type StratalEnv } from '../../env'
import { QueueBindingNotFoundError } from '../errors'
import { CloudflareQueueProvider } from '../providers/cloudflare-queue.provider'
import type { QueueMessage } from '../queue-consumer'

describe('CloudflareQueueProvider', () => {
  let provider: CloudflareQueueProvider
  let mockEnv: StratalEnv
  let mockQueue: DeepMocked<Queue>

  beforeEach(() => {
    mockQueue = createMock<Queue>()
    mockQueue.send.mockResolvedValue(undefined)
    mockQueue.sendBatch.mockResolvedValue(undefined)

    mockEnv = {
      NOTIFICATIONS_QUEUE: mockQueue,
    } as unknown as StratalEnv

    provider = new CloudflareQueueProvider(mockEnv)
  })

  const createMessage = <T>(type: string, payload: T): QueueMessage<T> => ({
    id: 'test-id-123',
    timestamp: Date.now(),
    type,
    payload,
  })

  describe('send', () => {
    it('should resolve queue binding and send message', async () => {
      const message = createMessage('email.send', { to: 'test@example.com' })

      await provider.send('notifications-queue', message)

      expect(mockQueue.send).toHaveBeenCalledTimes(1)
      expect(mockQueue.send).toHaveBeenCalledWith(message)
    })

    it('should throw QueueBindingNotFoundError when binding is missing', async () => {
      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        provider.send('non-existent-queue', message)
      ).rejects.toThrow(QueueBindingNotFoundError)
    })

    it('should convert queue name to binding name correctly', async () => {
      const message = createMessage('email.send', { to: 'test@example.com' })

      // notifications-queue -> NOTIFICATIONS_QUEUE
      await provider.send('notifications-queue', message)

      expect(mockQueue.send).toHaveBeenCalled()
    })

    it('should propagate queue.send errors', async () => {
      const sendError = new Error('Queue send failed')
      mockQueue.send.mockRejectedValue(sendError)

      const message = createMessage('email.send', { to: 'test@example.com' })

      await expect(
        provider.send('notifications-queue', message)
      ).rejects.toThrow('Queue send failed')
    })

    it('should send message with metadata', async () => {
      const message: QueueMessage<{ to: string }> = {
        id: 'test-id-123',
        timestamp: Date.now(),
        type: 'email.send',
        payload: { to: 'test@example.com' },
        metadata: {
          locale: 'en',
          priority: 'high',
        },
      }

      await provider.send('notifications-queue', message)

      expect(mockQueue.send).toHaveBeenCalledWith(message)
    })

  })
})
