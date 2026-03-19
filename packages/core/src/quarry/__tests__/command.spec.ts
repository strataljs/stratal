import 'reflect-metadata'

import { describe, expect, it } from 'vitest'
import { Command } from '../command'
import { getCommandResult, resetCommandState, setCommandInputs, setCommandQuarry } from '../command-internals'
import { CommandError } from '../errors/command.error'

class TestCommand extends Command {
  static command = 'test {name} {--verbose}'
  static description = 'A test command'

  handle(): Promise<undefined> {
    this.info(`Hello, ${this.string('name')}!`)
    return Promise.resolve(undefined)
  }
}

describe('Command', () => {
  // ── Input Accessors ──────────────────────────────────────────────

  describe('string()', () => {
    it('should return the string value', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { name: 'World' })
      expect(cmd.string('name')).toBe('World')
    })

    it('should return empty string for undefined', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, {})
      expect(cmd.string('name')).toBe('')
    })

    it('should throw CommandError for non-string value', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { name: 42 })
      expect(() => cmd.string('name')).toThrow(CommandError)
      expect(() => cmd.string('name')).toThrow('expected a string')
    })
  })

  describe('boolean()', () => {
    it('should return the boolean value', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { verbose: true })
      expect(cmd.boolean('verbose')).toBe(true)
    })

    it('should return false for undefined', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, {})
      expect(cmd.boolean('verbose')).toBe(false)
    })

    it('should throw CommandError for non-boolean value', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { verbose: 'yes' })
      expect(() => cmd.boolean('verbose')).toThrow(CommandError)
      expect(() => cmd.boolean('verbose')).toThrow('expected a boolean')
    })
  })

  describe('number()', () => {
    it('should return the number value', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { count: 5 })
      expect(cmd.number('count')).toBe(5)
    })

    it('should coerce string to number', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { count: '42' })
      expect(cmd.number('count')).toBe(42)
    })

    it('should return 0 for undefined', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, {})
      expect(cmd.number('count')).toBe(0)
    })

    it('should throw CommandError for NaN', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { count: 'abc' })
      expect(() => cmd.number('count')).toThrow(CommandError)
    })
  })

  describe('array()', () => {
    it('should return the array value', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { tags: ['a', 'b'] })
      expect(cmd.array('tags')).toEqual(['a', 'b'])
    })

    it('should return empty array for undefined', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, {})
      expect(cmd.array('tags')).toEqual([])
    })

    it('should throw CommandError for non-array value', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { tags: 'single' })
      expect(() => cmd.array('tags')).toThrow(CommandError)
    })
  })

  describe('input<T>()', () => {
    it('should return the raw value', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { custom: { nested: true } })
      expect(cmd.input<{ nested: boolean }>('custom')).toEqual({ nested: true })
    })
  })

  // ── Output Helpers ───────────────────────────────────────────────

  describe('output helpers', () => {
    it('should collect info messages', () => {
      const cmd = new TestCommand()
      cmd.info('test message')
      expect(getCommandResult(cmd).output).toEqual(['test message'])
    })

    it('should collect success messages', () => {
      const cmd = new TestCommand()
      cmd.success('done')
      expect(getCommandResult(cmd).output).toEqual(['done'])
    })

    it('should collect warn messages with prefix', () => {
      const cmd = new TestCommand()
      cmd.warn('low disk')
      expect(getCommandResult(cmd).output).toEqual(['Warning: low disk'])
    })

    it('should collect error messages', () => {
      const cmd = new TestCommand()
      cmd.error('something broke')
      expect(getCommandResult(cmd).errors).toEqual(['something broke'])
    })

    it('should write lines and newlines', () => {
      const cmd = new TestCommand()
      cmd.line('first')
      cmd.newLine()
      cmd.line('third')
      expect(getCommandResult(cmd).output).toEqual(['first', '', 'third'])
    })

    it('should write comments', () => {
      const cmd = new TestCommand()
      cmd.comment('a note')
      expect(getCommandResult(cmd).output).toEqual(['// a note'])
    })

    it('should format tables', () => {
      const cmd = new TestCommand()
      cmd.table(['Name', 'Age'], [['Alice', '30'], ['Bob', '25']])
      const output = getCommandResult(cmd).output
      expect(output).toHaveLength(4) // header + separator + 2 rows
      expect(output[0]).toContain('Name')
      expect(output[0]).toContain('Age')
      expect(output[1]).toContain('---')
      expect(output[2]).toContain('Alice')
      expect(output[3]).toContain('Bob')
    })

    it('should fail with error and exit code', () => {
      const cmd = new TestCommand()
      cmd.fail('fatal error', 2)
      const result = getCommandResult(cmd)
      expect(result.errors).toEqual(['fatal error'])
      expect(result.exitCode).toBe(2)
    })
  })

  // ── resetState ───────────────────────────────────────────────────

  describe('resetCommandState()', () => {
    it('should clear all state between invocations', () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { name: 'test' })
      cmd.info('output')
      cmd.error('error')
      cmd.fail('fail', 3)

      resetCommandState(cmd)

      const result = getCommandResult(cmd)
      expect(result.output).toEqual([])
      expect(result.errors).toEqual([])
      expect(result.exitCode).toBe(0)
      expect(cmd.string('name')).toBe('')
    })
  })

  // ── handle() ─────────────────────────────────────────────────────

  describe('handle()', () => {
    it('should execute the command logic', async () => {
      const cmd = new TestCommand()
      setCommandInputs(cmd, { name: 'World' })
      await cmd.handle()
      expect(getCommandResult(cmd).output).toEqual(['Hello, World!'])
    })
  })

  // ── call() ───────────────────────────────────────────────────────

  describe('call()', () => {
    it('should throw if quarry is not set', async () => {
      const cmd = new TestCommand()
      await expect(cmd.call('other:command')).rejects.toThrow(CommandError)
      await expect(cmd.call('other:command')).rejects.toThrow('Quarry reference not set')
    })

    it('should delegate to quarry.call()', async () => {
      const cmd = new TestCommand()
      const mockResult = { exitCode: 0, output: ['ok'], errors: [] }
      const mockQuarry = { call: () => Promise.resolve(mockResult) }
      setCommandQuarry(cmd, mockQuarry)

      const result = await cmd.call('other:command', { key: 'value' })
      expect(result).toEqual(mockResult)
    })
  })
})
