import { expect } from 'vitest'

/**
 * TestResponse
 *
 * Wrapper around Response with assertion methods.
 *
 * @example
 * ```typescript
 * response
 *   .assertOk()
 *   .assertStatus(200)
 *   .assertJsonPath('data.id', userId)
 * ```
 */
export class TestResponse {
  private jsonData: unknown = null
  private textData: string | null = null

  constructor(private readonly response: Response) {}

  /**
   * Get the raw Response object.
   */
  get raw(): Response {
    return this.response
  }

  /**
   * Get the response status code.
   */
  get status(): number {
    return this.response.status
  }

  /**
   * Get response headers.
   */
  get headers(): Headers {
    return this.response.headers
  }

  /**
   * Get the response body as JSON.
   */
  async json<T = unknown>(): Promise<T> {
    if (this.jsonData === null) {
      this.jsonData = await this.response.clone().json()
    }
    return this.jsonData as T
  }

  /**
   * Get the response body as text.
   */
  async text(): Promise<string> {
    this.textData ??= await this.response.clone().text()
    return this.textData
  }

  // ============================================================
  // Status Assertions
  // ============================================================

  /**
   * Assert response status is 200 OK.
   */
  assertOk(): this {
    return this.assertStatus(200)
  }

  /**
   * Assert response status is 201 Created.
   */
  assertCreated(): this {
    return this.assertStatus(201)
  }

  /**
   * Assert response status is 204 No Content.
   */
  assertNoContent(): this {
    return this.assertStatus(204)
  }

  /**
   * Assert response status is 400 Bad Request.
   */
  assertBadRequest(): this {
    return this.assertStatus(400)
  }

  /**
   * Assert response status is 401 Unauthorized.
   */
  assertUnauthorized(): this {
    return this.assertStatus(401)
  }

  /**
   * Assert response status is 403 Forbidden.
   */
  assertForbidden(): this {
    return this.assertStatus(403)
  }

  /**
   * Assert response status is 404 Not Found.
   */
  assertNotFound(): this {
    return this.assertStatus(404)
  }

  /**
   * Assert response status is 422 Unprocessable Entity.
   */
  assertUnprocessable(): this {
    return this.assertStatus(422)
  }

  /**
   * Assert response status is 500 Internal Server Error.
   */
  assertServerError(): this {
    return this.assertStatus(500)
  }

  /**
   * Assert response has the given status code.
   */
  assertStatus(expected: number): this {
    expect(
      this.response.status,
      `Expected status ${expected}, got ${this.response.status}`
    ).toBe(expected)
    return this
  }

  /**
   * Assert response status is in the 2xx success range.
   */
  assertSuccessful(): this {
    expect(
      this.response.status >= 200 && this.response.status < 300,
      `Expected successful status (2xx), got ${this.response.status}`
    ).toBe(true)
    return this
  }

  // ============================================================
  // JSON Assertions
  // ============================================================

  /**
   * Assert JSON response contains the given data.
   */
  async assertJson(expected: Record<string, unknown>): Promise<this> {
    const actual = await this.json<Record<string, unknown>>()

    for (const [key, value] of Object.entries(expected)) {
      expect(
        actual[key],
        `Expected JSON key "${key}" to be ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`
      ).toBe(value)
    }

    return this
  }

  /**
   * Assert JSON response has value at the given path.
   *
   * @param path - Dot-notation path (e.g., 'data.user.id')
   * @param expected - Expected value at path
   */
  async assertJsonPath(path: string, expected: unknown): Promise<this> {
    const json = await this.json()
    const actual = this.getValueAtPath(json, path)

    expect(
      actual,
      `Expected JSON path "${path}" to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    ).toBe(expected)

    return this
  }

  /**
   * Assert JSON response structure matches the given schema.
   */
  async assertJsonStructure(structure: string[]): Promise<this> {
    const json = await this.json<Record<string, unknown>>()

    for (const key of structure) {
      expect(
        key in json,
        `Expected JSON to have key "${key}", got keys: ${JSON.stringify(Object.keys(json))}`
      ).toBe(true)
    }

    return this
  }

  /**
   * Assert a JSON path exists (value can be anything, including null).
   *
   * @param path - Dot-notation path (e.g., 'data.user.id')
   */
  async assertJsonPathExists(path: string): Promise<this> {
    const json = await this.json()
    const exists = this.hasValueAtPath(json, path)

    expect(
      exists,
      `Expected JSON path "${path}" to exist`
    ).toBe(true)

    return this
  }

  /**
   * Assert a JSON path does not exist.
   *
   * @param path - Dot-notation path (e.g., 'data.user.deletedAt')
   */
  async assertJsonPathMissing(path: string): Promise<this> {
    const json = await this.json()
    const exists = this.hasValueAtPath(json, path)

    expect(
      exists,
      `Expected JSON path "${path}" to not exist`
    ).toBe(false)

    return this
  }

  /**
   * Assert JSON value at path matches a custom predicate.
   *
   * @param path - Dot-notation path (e.g., 'data.items')
   * @param matcher - Predicate function to validate the value
   */
  async assertJsonPathMatches(
    path: string,
    matcher: (value: unknown) => boolean
  ): Promise<this> {
    const json = await this.json()
    const value = this.getValueAtPath(json, path)

    expect(
      matcher(value),
      `Expected JSON path "${path}" to match predicate, got ${JSON.stringify(value)}`
    ).toBe(true)

    return this
  }

  /**
   * Assert string value at path contains a substring.
   *
   * @param path - Dot-notation path (e.g., 'data.message')
   * @param substring - Substring to search for
   */
  async assertJsonPathContains(path: string, substring: string): Promise<this> {
    const json = await this.json()
    const value = this.getValueAtPath(json, path)

    expect(
      typeof value === 'string',
      `Expected JSON path "${path}" to be a string, got ${typeof value}`
    ).toBe(true)

    expect(
      (value as string).includes(substring),
      `Expected JSON path "${path}" to contain "${substring}", got "${String(value)}"`
    ).toBe(true)

    return this
  }

  /**
   * Assert array value at path includes a specific item.
   *
   * @param path - Dot-notation path (e.g., 'data.tags')
   * @param item - Item to search for in the array
   */
  async assertJsonPathIncludes(path: string, item: unknown): Promise<this> {
    const json = await this.json()
    const value = this.getValueAtPath(json, path)

    expect(
      Array.isArray(value),
      `Expected JSON path "${path}" to be an array, got ${typeof value}`
    ).toBe(true)

    expect(
      (value as unknown[]).includes(item),
      `Expected JSON path "${path}" to include ${JSON.stringify(item)}`
    ).toBe(true)

    return this
  }

  /**
   * Assert array length at path equals the expected count.
   *
   * @param path - Dot-notation path (e.g., 'data.items')
   * @param count - Expected array length
   */
  async assertJsonPathCount(path: string, count: number): Promise<this> {
    const json = await this.json()
    const value = this.getValueAtPath(json, path)

    expect(
      Array.isArray(value),
      `Expected JSON path "${path}" to be an array, got ${typeof value}`
    ).toBe(true)

    expect(
      (value as unknown[]).length,
      `Expected JSON path "${path}" to have ${count} items, got ${(value as unknown[]).length}`
    ).toBe(count)

    return this
  }

  /**
   * Assert multiple JSON paths at once (batch assertion).
   *
   * @param expectations - Object mapping paths to expected values
   */
  async assertJsonPaths(expectations: Record<string, unknown>): Promise<this> {
    const json = await this.json()

    for (const [path, expected] of Object.entries(expectations)) {
      const actual = this.getValueAtPath(json, path)
      expect(
        actual,
        `Expected JSON path "${path}" to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      ).toBe(expected)
    }

    return this
  }

  // ============================================================
  // Header Assertions
  // ============================================================

  /**
   * Assert response has the given header.
   */
  assertHeader(name: string, expected?: string): this {
    const actual = this.response.headers.get(name)

    expect(
      actual !== null,
      `Expected header "${name}" to be present`
    ).toBe(true)

    if (expected !== undefined) {
      expect(
        actual,
        `Expected header "${name}" to be "${expected}", got "${actual}"`
      ).toBe(expected)
    }

    return this
  }

  /**
   * Assert response does not have the given header.
   */
  assertHeaderMissing(name: string): this {
    const actual = this.response.headers.get(name)

    expect(
      actual,
      `Expected header "${name}" to be absent, but got "${actual}"`
    ).toBeNull()

    return this
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Get value at dot-notation path.
   */
  private getValueAtPath(obj: unknown, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }

  /**
   * Check if a path exists in the object (even if value is null/undefined).
   */
  private hasValueAtPath(obj: unknown, path: string): boolean {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return false
      }

      if (typeof current !== 'object') {
        return false
      }

      const record = current as Record<string, unknown>

      if (!(part in record)) {
        return false
      }

      current = record[part]
    }

    return true
  }
}
