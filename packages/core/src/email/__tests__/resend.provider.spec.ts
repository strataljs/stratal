import { describe, expect, it, vi } from 'vitest'
import type { ResolvedEmailMessage } from '../contracts'
import type { EmailModuleOptions } from '../email.module'
import { ResendProvider } from '../providers/resend.provider'

// Mock the Resend SDK
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({
        data: { id: 'test-message-id' },
        error: null,
      }),
    },
  })),
}))

describe('ResendProvider', () => {
  const options: EmailModuleOptions = {
    provider: 'resend',
    apiKey: 'test-api-key',
    from: { name: 'Test', email: 'test@example.com' },
    queue: 'email',
  }

  it('should handle ReadableStream attachment content', async () => {
    const provider = new ResendProvider(options)

    const streamData = new TextEncoder().encode('stream content')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(streamData)
        controller.close()
      },
    })

    const message: ResolvedEmailMessage = {
      to: 'recipient@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
      attachments: [
        {
          filename: 'test.txt',
          content: stream,
          contentType: 'text/plain',
        },
      ],
    }

    const result = await provider.send(message)

    expect(result.accepted).toBe(true)
    expect(result.messageId).toBe('test-message-id')
  })
})
