import type {
	EmailBatchSendResult,
	EmailSendResult,
	IEmailProvider,
	ResolvedEmailMessage,
} from 'stratal/email'

/**
 * In-memory email provider for tests.
 *
 * The sync queue provider runs `EmailConsumer` inline on dispatch, which would
 * otherwise open a real SMTP connection from the test worker. The testing
 * module builder installs this provider by default (overridable via
 * `overrideProvider(EMAIL_TOKENS.EmailProviderFactory)`), recording every
 * message so tests can assert on what was sent.
 */
export class TestEmailProvider implements IEmailProvider {
	/** Every message handed to the provider, in send order. */
	readonly sent: ResolvedEmailMessage[] = []

	send(message: ResolvedEmailMessage): Promise<EmailSendResult> {
		this.sent.push(message)
		return Promise.resolve({ messageId: `test-${this.sent.length}`, accepted: true })
	}

	async sendBatch(messages: ResolvedEmailMessage[]): Promise<EmailBatchSendResult> {
		const results = await Promise.all(messages.map((message) => this.send(message)))
		return {
			total: results.length,
			successful: results.length,
			failed: 0,
			results,
		}
	}
}
