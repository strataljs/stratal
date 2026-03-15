/**
 * TestWsConnection
 *
 * Live WebSocket connection wrapper with assertion helpers for testing.
 *
 * @example
 * ```typescript
 * const ws = await module.ws('/ws/chat').connect()
 * ws.send('hello')
 * await ws.assertMessage('echo:hello')
 * ws.close()
 * await ws.waitForClose()
 * ```
 */
export class TestWsConnection {
	private readonly messageQueue: (string | ArrayBuffer)[] = []
	private messageWaiters: ((data: string | ArrayBuffer) => void)[] = []
	private closeEvent: { code?: number; reason?: string } | null = null
	private closeWaiters: ((event: { code?: number; reason?: string }) => void)[] = []

	constructor(private readonly ws: WebSocket) {
		this.ws.addEventListener('message', (event: MessageEvent) => {
			const data = event.data as string | ArrayBuffer
			if (this.messageWaiters.length > 0) {
				this.messageWaiters.shift()!(data)
			} else {
				this.messageQueue.push(data)
			}
		})

		this.ws.addEventListener('close', (event: CloseEvent) => {
			this.closeEvent = { code: event.code, reason: event.reason }
			for (const waiter of this.closeWaiters) {
				waiter(this.closeEvent)
			}
			this.closeWaiters = []
		})
	}

	/**
	 * Send a message through the WebSocket
	 */
	send(data: string | ArrayBuffer | Uint8Array): void {
		this.ws.send(data)
	}

	/**
	 * Close the WebSocket connection
	 */
	close(code?: number, reason?: string): void {
		this.ws.close(code, reason)
	}

	/**
	 * Wait for the next message, returning its data
	 */
	async waitForMessage(timeout = 5000): Promise<string | ArrayBuffer> {
		if (this.messageQueue.length > 0) {
			return this.messageQueue.shift()!
		}

		return new Promise<string | ArrayBuffer>((resolve, reject) => {
			const timer = setTimeout(() => {
				const index = this.messageWaiters.indexOf(resolve)
				if (index !== -1) this.messageWaiters.splice(index, 1)
				reject(new Error(`WebSocket: no message received within ${timeout}ms`))
			}, timeout)

			this.messageWaiters.push((data) => {
				clearTimeout(timer)
				resolve(data)
			})
		})
	}

	/**
	 * Wait for the connection to close
	 */
	async waitForClose(timeout = 5000): Promise<{ code?: number; reason?: string }> {
		if (this.closeEvent) {
			return this.closeEvent
		}

		return new Promise<{ code?: number; reason?: string }>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`WebSocket: connection did not close within ${timeout}ms`))
			}, timeout)

			this.closeWaiters.push((event) => {
				clearTimeout(timer)
				resolve(event)
			})
		})
	}

	/**
	 * Assert that the next message equals the expected value
	 */
	async assertMessage(expected: string, timeout = 5000): Promise<void> {
		const { expect } = await import('vitest')
		const data = await this.waitForMessage(timeout)
		const message = typeof data === 'string' ? data : '[ArrayBuffer]'
		expect(message, `Expected WebSocket message "${expected}", got "${message}"`).toBe(expected)
	}

	/**
	 * Assert that the connection closes, optionally with an expected code
	 */
	async assertClosed(expectedCode?: number, timeout = 5000): Promise<void> {
		const { expect } = await import('vitest')
		const event = await this.waitForClose(timeout)
		if (expectedCode !== undefined) {
			expect(event.code, `Expected close code ${expectedCode}, got ${event.code}`).toBe(expectedCode)
		}
	}

	/**
	 * Access the raw Cloudflare WebSocket
	 */
	get raw(): WebSocket {
		return this.ws
	}
}
