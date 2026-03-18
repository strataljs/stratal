import type { CommandResult } from 'stratal/quarry'
import { expect } from 'vitest'

/**
 * Fluent assertion wrapper for command results.
 *
 * @example
 * ```typescript
 * const result = await module
 *   .quarry('users:create')
 *   .withInput({ email: 'test@example.com' })
 *   .run()
 *
 * result.assertSuccessful()
 * result.assertOutputContains('User created')
 * ```
 */
export class TestCommandResult {
  constructor(private readonly result: CommandResult) {}

  get exitCode(): number {
    return this.result.exitCode
  }

  get output(): string[] {
    return this.result.output
  }

  get errors(): string[] {
    return this.result.errors
  }

  assertSuccessful(): this {
    expect(this.result.exitCode, `Expected exit code 0, got ${this.result.exitCode}. Errors: ${this.result.errors.join(', ')}`).toBe(0)
    expect(this.result.errors, 'Expected no errors').toHaveLength(0)
    return this
  }

  assertFailed(exitCode?: number): this {
    if (exitCode !== undefined) {
      expect(this.result.exitCode, `Expected exit code ${exitCode}, got ${this.result.exitCode}`).toBe(exitCode)
    } else {
      expect(this.result.exitCode, 'Expected non-zero exit code').not.toBe(0)
    }
    return this
  }

  assertExitCode(code: number): this {
    expect(this.result.exitCode, `Expected exit code ${code}, got ${this.result.exitCode}`).toBe(code)
    return this
  }

  assertOutputContains(text: string): this {
    const joined = this.result.output.join('\n')
    expect(joined, `Expected output to contain "${text}"`).toContain(text)
    return this
  }

  assertOutputMissing(text: string): this {
    const joined = this.result.output.join('\n')
    expect(joined, `Expected output NOT to contain "${text}"`).not.toContain(text)
    return this
  }

  assertErrorContains(text: string): this {
    const joined = this.result.errors.join('\n')
    expect(joined, `Expected errors to contain "${text}"`).toContain(text)
    return this
  }

  assertErrorMissing(text: string): this {
    const joined = this.result.errors.join('\n')
    expect(joined, `Expected errors NOT to contain "${text}"`).not.toContain(text)
    return this
  }
}
