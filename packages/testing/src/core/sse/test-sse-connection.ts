import { expect } from "vitest"

/**
 * Represents a parsed SSE event
 */
export interface TestSseEvent {
	data: string
	event?: string
	id?: string
	retry?: number
}

/**
 * TestSseConnection
 *
 * Live SSE connection wrapper with assertion helpers for testing.
 *
 * @example
 * ```typescript
 * const sse = await module.sse('/streaming/sse').connect()
 * await sse.assertEvent({ event: 'message', data: 'hello', id: '1' })
 * await sse.waitForEnd()
 * ```
 */
export class TestSseConnection {
	private readonly eventQueue: TestSseEvent[] = []
	private eventWaiters: ((event: TestSseEvent) => void)[] = []
	private streamEnded = false
	private endWaiters: (() => void)[] = []

	constructor(private readonly response: Response) {
		this.startReading()
	}

	/**
	 * Wait for the next SSE event
	 */
	async waitForEvent(timeout = 5000): Promise<TestSseEvent> {
		if (this.eventQueue.length > 0) {
			return this.eventQueue.shift()!
		}

		if (this.streamEnded) {
			throw new Error('SSE: stream has ended, no more events')
		}

		return new Promise<TestSseEvent>((resolve, reject) => {
			const timer = setTimeout(() => {
				const index = this.eventWaiters.indexOf(resolve)
				if (index !== -1) this.eventWaiters.splice(index, 1)
				reject(new Error(`SSE: no event received within ${timeout}ms`))
			}, timeout)

			this.eventWaiters.push((event) => {
				clearTimeout(timer)
				resolve(event)
			})
		})
	}

	/**
	 * Wait for the stream to end
	 */
	async waitForEnd(timeout = 5000): Promise<void> {
		if (this.streamEnded) return

		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`SSE: stream did not end within ${timeout}ms`))
			}, timeout)

			this.endWaiters.push(() => {
				clearTimeout(timer)
				resolve()
			})
		})
	}

	/**
	 * Collect all remaining events until the stream ends
	 */
	async collectEvents(timeout = 5000): Promise<TestSseEvent[]> {
		const events: TestSseEvent[] = []

		if (this.streamEnded) {
			return [...this.eventQueue.splice(0)]
		}

		return new Promise<TestSseEvent[]>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`SSE: stream did not end within ${timeout}ms`))
			}, timeout)

			// Drain any queued events first
			events.push(...this.eventQueue.splice(0))

			// Listen for new events until stream ends
			const originalDispatch = this.dispatchEvent.bind(this)
			this.dispatchEvent = (event: TestSseEvent) => {
				events.push(event)
				originalDispatch(event)
			}

			this.endWaiters.push(() => {
				clearTimeout(timer)
				this.dispatchEvent = originalDispatch
				resolve(events)
			})
		})
	}

	/**
	 * Assert that the next event matches the expected partial shape
	 */
	async assertEvent(expected: Partial<TestSseEvent>, timeout = 5000): Promise<void> {
		const event = await this.waitForEvent(timeout)
		expect(event).toMatchObject(expected)
	}

	/**
	 * Assert that the next event's data matches the expected string
	 */
	async assertEventData(expected: string, timeout = 5000): Promise<void> {
		const event = await this.waitForEvent(timeout)
		expect(event.data, `Expected SSE data "${expected}", got "${event.data}"`).toBe(expected)
	}

	/**
	 * Assert that the next event's data is JSON matching the expected value
	 */
	async assertJsonEventData<T>(expected: T, timeout = 5000): Promise<void> {
		const event = await this.waitForEvent(timeout)
		const parsed = JSON.parse(event.data) as unknown
		expect(parsed).toEqual(expected)
	}

	/**
	 * Access the raw Response
	 */
	get raw(): Response {
		return this.response
	}

	private startReading(): void {
		const body = this.response.body
		if (!body) {
			this.streamEnded = true
			return
		}

		const reader = body.getReader() as ReadableStreamDefaultReader<Uint8Array>
		const decoder = new TextDecoder()
		let buffer = ''

		const read = async (): Promise<void> => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				while (true) {
					const { done, value } = await reader.read()

					if (done) {
						// Parse any remaining buffered data
						if (buffer.trim()) {
							const event = this.parseEvent(buffer)
							if (event) this.dispatchEvent(event)
						}
						this.streamEnded = true
						for (const waiter of this.endWaiters) {
							waiter()
						}
						this.endWaiters = []
						return
					}

					buffer += decoder.decode(value, { stream: true })

					// Split on double newlines (SSE event boundary)
					const parts = buffer.split('\n\n')
					// Last part may be incomplete, keep it in the buffer
					buffer = parts.pop()!

					for (const part of parts) {
						if (!part.trim()) continue
						const event = this.parseEvent(part)
						if (event) this.dispatchEvent(event)
					}
				}
			} catch {
				this.streamEnded = true
				for (const waiter of this.endWaiters) {
					waiter()
				}
				this.endWaiters = []
			}
		}

		void read()
	}

	private parseEvent(raw: string): TestSseEvent | null {
		const lines = raw.split('\n')
		const dataLines: string[] = []
		let event: string | undefined
		let id: string | undefined
		let retry: number | undefined

		for (const line of lines) {
			if (line.startsWith(':')) continue // comment line

			const colonIndex = line.indexOf(':')
			if (colonIndex === -1) continue

			const field = line.slice(0, colonIndex)
			// Strip optional leading space after colon
			const value = line[colonIndex + 1] === ' ' ? line.slice(colonIndex + 2) : line.slice(colonIndex + 1)

			switch (field) {
				case 'data':
					dataLines.push(value)
					break
				case 'event':
					event = value
					break
				case 'id':
					id = value
					break
				case 'retry': {
					const parsed = parseInt(value, 10)
					if (!isNaN(parsed)) retry = parsed
					break
				}
			}
		}

		if (dataLines.length === 0) return null

		const result: TestSseEvent = { data: dataLines.join('\n') }
		if (event !== undefined) result.event = event
		if (id !== undefined) result.id = id
		if (retry !== undefined) result.retry = retry

		return result
	}

	private dispatchEvent(event: TestSseEvent): void {
		if (this.eventWaiters.length > 0) {
			this.eventWaiters.shift()!(event)
		} else {
			this.eventQueue.push(event)
		}
	}
}
