/**
 * Options for mocking JSON responses
 */
export interface MockJsonOptions {
	/**
	 * HTTP status code for the response
	 * @default 200
	 */
	status?: number

	/**
	 * Custom headers to include in the response
	 */
	headers?: Record<string, string>

	/**
	 * Delay in milliseconds before responding
	 */
	delay?: number

	/**
	 * HTTP method to match (GET, POST, PUT, PATCH, DELETE, etc.)
	 * @default 'GET'
	 */
	method?: string

	/**
	 * Specific path to override URL pathname
	 * If not provided, the pathname from the URL will be used
	 */
	path?: string
}

/**
 * Options for mocking error responses
 */
export interface MockErrorOptions {
	/**
	 * Custom headers to include in the error response
	 */
	headers?: Record<string, string>

	/**
	 * HTTP method to match (GET, POST, PUT, PATCH, DELETE, etc.)
	 * @default 'GET'
	 */
	method?: string

	/**
	 * Specific path to override URL pathname
	 * If not provided, the pathname from the URL will be used
	 */
	path?: string
}
