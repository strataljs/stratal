import type { CommandInput } from 'stratal/quarry'
import type { TestingModule } from '../testing-module'
import { TestCommandResult } from './test-command-result'

/**
 * Fluent builder for testing Quarry commands.
 *
 * @example
 * ```typescript
 * const result = await module
 *   .quarry('users:create')
 *   .withInput({ email: 'test@example.com', admin: true })
 *   .run()
 *
 * result.assertSuccessful()
 * result.assertOutputContains('User created')
 * ```
 */
export class TestCommandRequest {
  private _input: CommandInput = {}

  constructor(
    private readonly commandName: string,
    private readonly module: TestingModule,
  ) {}

  /**
   * Set the flat input for the command.
   */
  withInput(input: CommandInput): this {
    this._input = { ...input }
    return this
  }

  /**
   * Execute the command and return a TestCommandResult for assertions.
   */
  async run(): Promise<TestCommandResult> {
    const result = await this.module.application.handleCommand(this.commandName, this._input)
    return new TestCommandResult(result)
  }
}
