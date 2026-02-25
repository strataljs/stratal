import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import type { LoggerService } from '../../logger/services/logger.service'
import type { StorageService } from '../../storage/services/storage.service'
import type { DownloadResult } from '../../storage/contracts/download-result'
import type { QueueMessage } from '../../queue/queue-consumer'
import type { SendEmailInput } from '../contracts/send-email.input'
import type { IEmailProvider } from '../providers/email-provider.interface'
import type { EmailProviderFactory } from '../services/email-provider-factory'
import { EmailConsumer } from '../consumers/email.consumer'

describe('EmailConsumer', () => {
  let consumer: EmailConsumer
  let mockLogger: DeepMocked<LoggerService>
  let mockProviderFactory: DeepMocked<EmailProviderFactory>
  let mockStorage: DeepMocked<StorageService>
  let mockProvider: { send: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = createMock<LoggerService>()
    mockProviderFactory = createMock<EmailProviderFactory>()
    mockStorage = createMock<StorageService>()

    mockProvider = { send: vi.fn().mockResolvedValue({ messageId: 'msg-123' }) }
    mockProviderFactory.create.mockResolvedValue(mockProvider as unknown as IEmailProvider)

    consumer = new EmailConsumer(
      mockLogger as unknown as LoggerService,
      mockProviderFactory as unknown as EmailProviderFactory,
      mockStorage as unknown as StorageService
    )
  })

  const createMessage = (
    overrides?: Partial<QueueMessage<SendEmailInput>>
  ): QueueMessage<SendEmailInput> => ({
    id: 'msg-1',
    timestamp: Date.now(),
    type: 'email.send',
    payload: {
      to: 'user@example.com',
      subject: 'Test',
      html: '<h1>Hello</h1>',
    } as SendEmailInput,
    ...overrides,
  })

  describe('messageTypes', () => {
    it('should equal ["email.send", "email.batch.send"]', () => {
      expect(consumer.messageTypes).toEqual(['email.send', 'email.batch.send'])
    })
  })

  describe('handle()', () => {
    it('should create provider via factory and call provider.send()', async () => {
      const message = createMessage()

      await consumer.handle(message)

      expect(mockProviderFactory.create).toHaveBeenCalled()
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Test',
          html: '<h1>Hello</h1>',
        })
      )
    })

    it('should resolve inline attachments: base64 decoded to Buffer', async () => {
      const base64Content = Buffer.from('file content').toString('base64')
      const message = createMessage({
        payload: {
          to: 'user@example.com',
          subject: 'Test',
          attachments: [
            {
              filename: 'test.pdf',
              content: base64Content,
              contentType: 'application/pdf',
            },
          ],
        } as SendEmailInput,
      })

      await consumer.handle(message)

      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: 'test.pdf',
              content: Buffer.from(base64Content, 'base64'),
              contentType: 'application/pdf',
            }),
          ],
        })
      )
    })

    it('should resolve storage attachments: downloads and passes stream', async () => {
      const mockStream = createMock<ReadableStream>()
      mockStorage.download.mockResolvedValue({
        toStream: () => mockStream,
        contentType: 'application/pdf',
      } as unknown as DownloadResult)

      const message = createMessage({
        payload: {
          to: 'user@example.com',
          subject: 'Test',
          attachments: [
            {
              filename: 'doc.pdf',
              storageKey: 'uploads/doc.pdf',
              disk: 'default',
            },
          ],
        } as SendEmailInput,
      })

      await consumer.handle(message)

      expect(mockStorage.download).toHaveBeenCalledWith('uploads/doc.pdf', 'default')
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: 'doc.pdf',
              content: mockStream,
              contentType: 'application/pdf',
            }),
          ],
        })
      )
    })

    it('should re-throw errors for queue retry', async () => {
      const error = new Error('send failed')
      mockProvider.send.mockRejectedValue(error)

      await expect(consumer.handle(createMessage())).rejects.toThrow('send failed')
    })

    it('should pass undefined for attachments when message has none', async () => {
      const message = createMessage()

      await consumer.handle(message)

      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: undefined,
        })
      )
    })
  })

  describe('onError()', () => {
    it('should log error with tenantId and recipientCount', async () => {
      const error = new Error('final failure')
      const message = createMessage({ tenantId: 'tenant-123' })

      await consumer.onError(error, message)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Email send failed after retries',
        expect.objectContaining({
          tenantId: 'tenant-123',
          recipientCount: 1,
          error: 'final failure',
        })
      )
    })
  })
})
