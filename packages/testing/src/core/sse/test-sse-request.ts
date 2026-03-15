import type { AuthService } from '@stratal/framework/auth'
import { AUTH_SERVICE } from '@stratal/framework/auth'
import { expect } from 'vitest'
import { ActingAs } from '../../auth'
import type { TestingModule } from '../testing-module'
import { TestSseConnection } from './test-sse-connection'

/**
 * TestSseRequest
 *
 * Builder for SSE connection requests. Follows the TestWsRequest pattern.
 *
 * @example
 * ```typescript
 * const sse = await module.sse('/streaming/sse').connect()
 * await sse.assertEvent({ event: 'message', data: 'hello' })
 * await sse.waitForEnd()
 * ```
 *
 * @example Authenticated SSE
 * ```typescript
 * const sse = await module.sse('/streaming/sse').actingAs({ id: user.id }).connect()
 * ```
 */
export class TestSseRequest {
	private requestHeaders: Headers = new Headers()
	private actingAsUser: { id: string } | null = null

	constructor(
		private readonly path: string,
		private readonly module: TestingModule,
	) { }

	/**
	 * Add custom headers to the request
	 */
	withHeaders(headers: Record<string, string>): this {
		for (const [key, value] of Object.entries(headers)) {
			this.requestHeaders.set(key, value)
		}
		return this
	}

	/**
	 * Authenticate the SSE connection as a specific user
	 */
	actingAs(user: { id: string }): this {
		this.actingAsUser = user
		return this
	}

	/**
	 * Send the request and return a live SSE connection
	 */
	async connect(): Promise<TestSseConnection> {
		await this.applyAuthentication()

		this.requestHeaders.set('Accept', 'text/event-stream')

		const url = new URL(this.path, 'http://localhost')
		const request = new Request(url.toString(), {
			headers: this.requestHeaders,
		})

		const response = await this.module.fetch(request)

		expect(
			response.status,
			`Expected status 200, got ${response.status}`,
		).toBe(200)

		const contentType = response.headers.get('content-type') ?? ''
		expect(
			contentType.includes('text/event-stream'),
			`Expected content-type "text/event-stream", got "${contentType}"`,
		).toBe(true)

		return new TestSseConnection(response)
	}

	private async applyAuthentication(): Promise<void> {
		if (!this.actingAsUser) return

		await this.module.runInRequestScope(async () => {
			const authService = this.module.get<AuthService>(AUTH_SERVICE)
			const actingAs = new ActingAs(authService)
			const authHeaders = this.actingAsUser ? await actingAs.createSessionForUser(this.actingAsUser) : new Headers()

			for (const [key, value] of authHeaders.entries()) {
				this.requestHeaders.set(key, value)
			}
		})
	}
}
