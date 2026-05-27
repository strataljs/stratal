import type { QueueMessage } from './queue-consumer'

export interface FailedJobMetadata {
  queue: string
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
