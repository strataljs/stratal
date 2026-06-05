import type { AuthService } from '@stratal/framework/auth'
import { AUTH_SERVICE } from '@stratal/framework/auth'
import type { DetectionStrategy } from 'stratal/i18n'
import { Macroable } from 'stratal/macroable'
import { ActingAs } from '../../auth'
import type { TestingModule } from '../testing-module'
import { applyLocaleToHeaders, applyLocaleToUrl, resolveLocaleStrategy } from './locale-helper'
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
export class TestHttpRequest extends Macroable {
	protected body: unknown = null
	protected requestHeaders: Headers
	protected actingAsUser: { id: string } | null = null
	protected authResolver: ((module: TestingModule, user: { id: string }) => Promise<Headers>) | null = null
	protected localeConfig: { locale: string; strategy: DetectionStrategy } | null

	constructor(
		protected readonly method: string,
		protected readonly path: string,
		headers: Headers,
		protected readonly module: TestingModule,
		protected readonly host: string | null = null,
		localeConfig: { locale: string; strategy: DetectionStrategy } | null = null,
	) {
		super()
		this.requestHeaders = new Headers(headers)
		this.localeConfig = localeConfig
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
	 * Set the locale for this request.
	 * If strategy is not provided, resolves from the module's I18n configuration.
	 *
	 * @param locale - Locale code (e.g., 'en', 'fr')
	 * @param strategy - Detection strategy override
	 */
	withLocale(locale: string, strategy?: DetectionStrategy): this {
		const resolved = strategy ?? resolveLocaleStrategy(this.module)
		this.localeConfig = { locale, strategy: resolved }
		applyLocaleToHeaders(this.requestHeaders, locale, resolved)
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
		this.authResolver = null
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

		// Apply locale to URL for querystring strategy
		if (this.localeConfig) {
			applyLocaleToUrl(url, this.localeConfig.locale, this.localeConfig.strategy)
		}

		const request = new Request(url.toString(), {
			method: this.method,
			headers: this.requestHeaders,
			body: this.body ? JSON.stringify(this.body) : null,
		})

		// Call module.fetch() - NO SELF.fetch()
		const response = await this.module.fetch(request)
		return new TestResponse(response)
	}

	protected async applyAuthentication(): Promise<void> {
		if (!this.actingAsUser) return

		if (this.authResolver) {
			const headers = await this.authResolver(this.module, this.actingAsUser)
			for (const [key, value] of headers.entries()) {
				this.requestHeaders.set(key, value)
			}
			return
		}

		await this.module.runInRequestScope(async () => {
			const authService = this.module.get<AuthService>(AUTH_SERVICE)
			const actingAs = new ActingAs(authService)
			const authHeaders = await actingAs.createSessionForUser(this.actingAsUser!)

			for (const [key, value] of authHeaders.entries()) {
				this.requestHeaders.set(key, value)
			}
		})
	}
}
