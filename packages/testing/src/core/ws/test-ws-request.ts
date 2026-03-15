import type { AuthService } from '@stratal/framework/auth'
import { AUTH_SERVICE } from '@stratal/framework/auth'
import { ActingAs } from '../../auth'
import type { TestingModule } from '../testing-module'
import { TestWsConnection } from './test-ws-connection'

/**
 * TestWsRequest
 *
 * Builder for WebSocket upgrade requests. Follows the TestHttpRequest pattern.
 *
 * @example
 * ```typescript
 * const ws = await module.ws('/ws/chat').connect()
 * ws.send('hello')
 * await ws.assertMessage('echo:hello')
 * ws.close()
 * ```
 *
 * @example Authenticated WebSocket
 * ```typescript
 * const ws = await module.ws('/ws/chat').actingAs({ id: user.id }).connect()
 * ```
 */
export class TestWsRequest {
	private requestHeaders: Headers = new Headers()
	private actingAsUser: { id: string } | null = null

	constructor(
		private readonly path: string,
		private readonly module: TestingModule,
	) {}

	/**
	 * Add custom headers to the upgrade request
	 */
	withHeaders(headers: Record<string, string>): this {
		for (const [key, value] of Object.entries(headers)) {
			this.requestHeaders.set(key, value)
		}
		return this
	}

	/**
	 * Authenticate the WebSocket connection as a specific user
	 */
	actingAs(user: { id: string }): this {
		this.actingAsUser = user
		return this
	}

	/**
	 * Send the upgrade request and return a live WebSocket connection
	 */
	async connect(): Promise<TestWsConnection> {
		await this.applyAuthentication()

		this.requestHeaders.set('Upgrade', 'websocket')
		this.requestHeaders.set('Connection', 'Upgrade')
		this.requestHeaders.set('Sec-WebSocket-Key', 'dGhlIHNhbXBsZSBub25jZQ==')
		this.requestHeaders.set('Sec-WebSocket-Version', '13')

		const url = new URL(this.path, 'http://localhost')
		const request = new Request(url.toString(), {
			headers: this.requestHeaders,
		})

		const response = await this.module.fetch(request)

		const { expect } = await import('vitest')
		expect(
			response.status,
			`Expected status 101 (Switching Protocols), got ${response.status}`,
		).toBe(101)

		const ws = (response as Response & { webSocket: WebSocket | null }).webSocket
		if (!ws) {
			throw new Error('Response did not include a WebSocket connection')
		}

		ws.accept()

		return new TestWsConnection(ws)
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
