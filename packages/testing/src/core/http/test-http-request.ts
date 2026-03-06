import type { AuthService } from '@stratal/framework/auth'
import { AUTH_SERVICE } from '@stratal/framework/auth'
import { ActingAs } from '../../auth'
import type { TestingModule } from '../testing-module'
import { TestResponse } from './test-response'

/**
 * TestHttpRequest
 *
 * Request builder with fluent API for configuring test HTTP requests.
 *
 * @example
 * ```typescript
 * const response = await module.http
 *   .post('/api/v1/register')
 *   .withBody({ name: 'Test School' })
 *   .withHeaders({ 'X-Custom': 'value' })
 *   .send()
 * ```
 *
 * @example Authenticated request
 * ```typescript
 * const response = await module.http
 *   .get('/api/v1/profile')
 *   .actingAs({ id: user.id })
 *   .send()
 * ```
 */
export class TestHttpRequest {
	private body: unknown = null
	private requestHeaders: Headers
	private actingAsUser: { id: string } | null = null

	constructor(
		private readonly method: string,
		private readonly path: string,
		headers: Headers,
		private readonly module: TestingModule,
		private readonly host: string | null = null
	) {
		this.requestHeaders = new Headers(headers)
	}

	/**
	 * Set the request body
	 */
	withBody(data: unknown): this {
		this.body = data
		return this
	}

	/**
	 * Add headers to the request
	 */
	withHeaders(headers: Record<string, string>): this {
		for (const [key, value] of Object.entries(headers)) {
			this.requestHeaders.set(key, value)
		}
		return this
	}

	/**
	 * Set Content-Type to application/json
	 */
	asJson(): this {
		this.requestHeaders.set('Content-Type', 'application/json')
		return this
	}

	/**
	 * Authenticate the request as a specific user
	 */
	actingAs(user: { id: string }): this {
		this.actingAsUser = user
		return this
	}

	/**
	 * Send the request and return response
	 *
	 * Calls module.fetch() - NOT SELF.fetch()
	 */
	async send(): Promise<TestResponse> {
		await this.applyAuthentication()

		// Auto-set Content-Type for body
		if (this.body && !this.requestHeaders.has('Content-Type')) {
			this.requestHeaders.set('Content-Type', 'application/json')
		}

		// Build request
		const url = new URL(this.path, `http://${this.host ?? 'localhost'}`)
		const request = new Request(url.toString(), {
			method: this.method,
			headers: this.requestHeaders,
			body: this.body ? JSON.stringify(this.body) : null,
		})

		// Call module.fetch() - NO SELF.fetch()
		const response = await this.module.fetch(request)
		return new TestResponse(response)
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
