import type { ReactElement } from 'react'
import { inject } from '../../di'
import { Transient } from '../../di/decorators'
import type { IQueueSender } from '../../queue'
import type { SendBatchEmailInput, SendEmailInput } from '../contracts'
import { EMAIL_TOKENS } from '../email.tokens'

export type SendEmailInputWithTemplate = Omit<SendEmailInput, 'html' | 'text'> & {
  template?: ReactElement
}

export type SendBatchEmailInputWithTemplate = Omit<SendBatchEmailInput, 'messages'> & {
  messages: SendEmailInputWithTemplate[]
}

/**
 * Email Service
 *
 * Main facade for sending emails. Routes emails to queues for async processing.
 * The queue is injected via EMAIL_TOKENS.EmailQueue, configured by the application
 * via EmailModule.forRoot({ queue: 'QUEUE_BINDING_NAME' }).
 *
 * @example Basic usage
 * ```typescript
 * @inject(EMAIL_TOKENS.EmailService)
 * private readonly emailService: EmailService
 *
 * await this.emailService.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   template: <WelcomeEmail name="John" />
 * })
 * ```
 */
@Transient(EMAIL_TOKENS.EmailService)
export class EmailService {
  constructor(
    @inject(EMAIL_TOKENS.EmailQueue)
    protected readonly queue: IQueueSender
  ) { }

  /**
   * Send a single email
   *
   * Dispatches the email to the queue for async processing.
   * Supports optional React template rendering.
   *
   * @param input - Email message details
   */
  async send({ template, ...input }: SendEmailInputWithTemplate): Promise<void> {
    // `@react-email/render` (plus its html-to-text/htmlparser2 deps) is heavy and
    // only needed when a React template is supplied. Defer it to a dynamic import
    // so it lands in its own chunk and is never parsed/evaluated at worker cold
    // start — email sending is off the request hot path.
    let html: string | undefined
    if (template) {
      const { render } = await import('@react-email/render')
      html = await render(template)
    }
    await this.queue.dispatch({
      type: 'email.send',
      payload: { ...input, html },
    })
  }

  /**
   * Send multiple emails in a batch
   *
   * Dispatches all emails to the queue for async processing.
   * Supports React template rendering for each message.
   *
   * @param input - Batch email details
   */
  async sendBatch(input: SendBatchEmailInputWithTemplate): Promise<void> {
    for (const message of input.messages) {
      await this.send(message)
    }
  }
}
