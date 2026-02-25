import { fetchMock } from 'cloudflare:test'
import type { MockJsonOptions, MockErrorOptions } from './fetch-mock.types'

/**
 * Wrapper around Cloudflare's fetchMock for declarative fetch mocking in tests
 *
 * Based on undici's MockAgent, fetchMock.get(origin) returns a MockPool for that origin.
 * The MockPool's intercept() method is used to define which requests to mock.
 *
 * @example
 * ```typescript
 * import { createFetchMock } from '@stratal/testing'
 *
 * const mock = createFetchMock()
 *
 * beforeEach(() => {
 *   mock.activate()
 *   mock.disableNetConnect()
 * })
 *
 * afterEach(() => {
 *   mock.reset()
 * })
 *
 * it('should mock external API', async () => {
 *   // Using helper method
 *   mock.mockJsonResponse('https://api.example.com/data', { success: true })
 *
 *   // Or using direct API
 *   mock.get('https://api.example.com')
 *     .intercept({ path: '/users', method: 'POST' })
 *     .reply(201, JSON.stringify({ created: true }))
 *
 *   const response = await fetch('https://api.example.com/data')
 *   const json = await response.json()
 *
 *   expect(json.success).toBe(true)
 *   mock.assertNoPendingInterceptors()
 * })
 * ```
 */
export class FetchMock {
	/**
	 * Get a MockPool for the specified origin
	 *
	 * This is the underlying fetchMock.get() method that returns a MockPool
	 * for mocking requests to the specified origin.
	 *
	 * @param origin - The origin URL (e.g., 'https://api.example.com')
	 * @returns MockPool for chaining .intercept() and .reply()
	 *
	 * @example
	 * ```typescript
	 * // Mock a GET request
	 * mock.get('https://api.example.com')
	 *   .intercept({ path: '/users', method: 'GET' })
	 *   .reply(200, JSON.stringify({ users: [] }))
	 *
	 * // Mock a POST request with body matching
	 * mock.get('https://api.example.com')
	 *   .intercept({
	 *     path: '/users',
	 *     method: 'POST',
	 *     body: (body) => body.includes('test')
	 *   })
	 *   .reply(201, JSON.stringify({ created: true }))
	 * ```
	 */
	get(origin: string) {
		return fetchMock.get(origin)
	}

	/**
	 * Activate fetch mocking for the current test
	 *
	 * @example
	 * ```typescript
	 * beforeEach(() => {
	 *   mock.activate()
	 * })
	 * ```
	 */
	activate() {
		fetchMock.activate();
	}

	/**
	 * Deactivate fetch mocking
	 */
	deactivate() {
		fetchMock.deactivate();
	}

	/**
	 * Disable all network connections, forcing all requests to use mocks
	 *
	 * @example
	 * ```typescript
	 * beforeEach(() => {
	 *   mock.activate()
	 *   mock.disableNetConnect() // Ensure all requests are mocked
	 * })
	 * ```
	 */
	disableNetConnect() {
		fetchMock.disableNetConnect();
	}

	/**
	 * Enable network connections for specific hosts
	 *
	 * @example
	 * ```typescript
	 * mock.enableNetConnect('localhost')
	 * mock.enableNetConnect(/^https:\/\/trusted\.com/)
	 * ```
	 */
	enableNetConnect(host?: string | RegExp) {
		if (host) {
			fetchMock.enableNetConnect(host); return;
		}
		fetchMock.enableNetConnect();
	}

	/**
	 * Assert that all defined interceptors were called
	 *
	 * @throws {Error} If there are pending interceptors that weren't matched
	 *
	 * @example
	 * ```typescript
	 * it('should call all mocked endpoints', async () => {
	 *   mock.mockJsonResponse('https://api.example.com/data', { data: [] })
	 *
	 *   await fetch('https://api.example.com/data')
	 *
	 *   mock.assertNoPendingInterceptors() // Pass
	 * })
	 * ```
	 */
	assertNoPendingInterceptors() {
		fetchMock.assertNoPendingInterceptors();
	}

	/**
	 * Reset all mocks and interceptors
	 *
	 * @example
	 * ```typescript
	 * afterEach(() => {
	 *   mock.reset()
	 * })
	 * ```
	 */
	reset() {
		// Reset by deactivating
		fetchMock.deactivate()
	}

	/**
	 * Helper method to mock JSON responses
	 *
	 * Automatically parses the URL into origin and path, and sets up the mock.
	 *
	 * @param url - Full URL to mock (e.g., 'https://api.example.com/users')
	 * @param data - JSON data to return
	 * @param options - Additional options for the mock
	 *
	 * @example
	 * ```typescript
	 * // Mock a GET request
	 * mock.mockJsonResponse('https://api.example.com/users', { users: [] })
	 *
	 * // Mock a POST request
	 * mock.mockJsonResponse(
	 *   'https://api.example.com/users',
	 *   { created: true },
	 *   { method: 'POST', status: 201 }
	 * )
	 *
	 * // With custom headers and delay
	 * mock.mockJsonResponse(
	 *   'https://api.example.com/users',
	 *   { users: [] },
	 *   {
	 *     status: 200,
	 *     method: 'GET',
	 *     headers: { 'X-Custom': 'value' },
	 *     delay: 100
	 *   }
	 * )
	 * ```
	 */
	mockJsonResponse(url: string, data: unknown, options: MockJsonOptions = {}) {
		const parsedUrl = new URL(url)
		const origin = `${parsedUrl.protocol}//${parsedUrl.host}`
		const path = options.path ?? parsedUrl.pathname
		const method = options.method ?? 'GET'
		const { status = 200, headers = {}, delay } = options

		const defaultHeaders = {
			'Content-Type': 'application/json',
			...headers,
		}

		const mock = fetchMock
			.get(origin)
			.intercept({ path, method })
			.reply(status, JSON.stringify(data), { headers: defaultHeaders })

		if (delay) {
			return mock.delay(delay)
		}

		return mock
	}

	/**
	 * Helper method to mock error responses
	 *
	 * @param url - Full URL to mock
	 * @param status - HTTP error status code
	 * @param message - Optional error message
	 * @param options - Additional options for the error mock
	 *
	 * @example
	 * ```typescript
	 * // Mock a 401 error
	 * mock.mockError('https://api.example.com/fail', 401, 'Unauthorized')
	 *
	 * // Mock a 500 error with custom method
	 * mock.mockError(
	 *   'https://api.example.com/fail',
	 *   500,
	 *   'Server Error',
	 *   { method: 'POST' }
	 * )
	 * ```
	 */
	mockError(url: string, status: number, message?: string, options: MockErrorOptions = {}) {
		const parsedUrl = new URL(url)
		const origin = `${parsedUrl.protocol}//${parsedUrl.host}`
		const path = options.path ?? parsedUrl.pathname
		const method = options.method ?? 'GET'
		const { headers = {} } = options

		const body = message ? JSON.stringify({ error: message }) : ''
		const responseHeaders = message
			? { 'Content-Type': 'application/json', ...headers }
			: headers

		return fetchMock
			.get(origin)
			.intercept({ path, method })
			.reply(status, body, { headers: responseHeaders })
	}

	/**
	 * Generic helper to mock any HTTP request
	 *
	 * @param origin - The origin URL (e.g., 'https://api.example.com')
	 * @param options - Request matching and response options
	 *
	 * @example
	 * ```typescript
	 * mock.mockRequest('https://api.example.com', {
	 *   path: '/users',
	 *   method: 'PUT',
	 *   status: 200,
	 *   body: { updated: true }
	 * })
	 * ```
	 */
	mockRequest(
		origin: string,
		options: { path: string; method?: string; status?: number; body?: unknown }
	) {
		const { path, method = 'GET', status = 200, body } = options

		return fetchMock
			.get(origin)
			.intercept({ path, method })
			.reply(status, body ? JSON.stringify(body) : '')
	}
}

/**
 * Factory function to create a new FetchMock instance
 *
 * @returns A new FetchMock instance
 *
 * @example
 * ```typescript
 * import { createFetchMock } from '@stratal/testing'
 *
 * const mock = createFetchMock()
 *
 * beforeEach(() => {
 *   mock.activate()
 *   mock.disableNetConnect()
 * })
 *
 * afterEach(() => {
 *   mock.reset()
 * })
 * ```
 */
export function createFetchMock(): FetchMock {
	return new FetchMock()
}
