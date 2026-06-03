import type { QueueMessage } from './queue-consumer';

export interface FailedJobMetadata {
  /** Cloudflare queue name the message was consumed from (display/filtering). */
  queue: string
  /** Producer binding to re-enqueue through on retry. */
  binding: string
  type: string
  consumer: string
  attempts: number
  failedAt: string
}

export interface FailedJob extends FailedJobMetadata {
  id: string
  message: QueueMessage
  error: {
    name: string
    message: string
    stack?: string
  }
}
