import { createMock } from '@stratal/testing/mocks'
import { Cli } from 'clipanion'
import { describe, expect, it } from 'vitest'
import { CommandNotFoundError } from '../../quarry/errors/command-not-found.error'
import type { QuarryRegistry } from '../../quarry/quarry-registry'
import { createHelpCommand } from '../commands/help-command'

function buildCli(quarry: QuarryRegistry) {
  const cli = new Cli({ binaryName: 'quarry' })
  cli.register(createHelpCommand(quarry))
  return cli
}

async function runCli(cli: Cli, args: string[]) {
  const stdout: string[] = []
  const stderr: string[] = []

  const exitCode = await cli.run(args, {
    stdin: process.stdin,
    stdout: { write: (data: string) => { stdout.push(data); return true } } as NodeJS.WriteStream,
    stderr: { write: (data: string) => { stderr.push(data); return true } } as NodeJS.WriteStream,
  })

  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') }
}

describe('createHelpCommand', () => {
  it('should use quarry.usage() for a registered command', async () => {
    const quarry = createMock<QuarryRegistry>()
    quarry.usage.mockResolvedValue('Usage: quarry greet [name]\n\nArguments:\n  name  (default: World)')

    const cli = buildCli(quarry)
    const { exitCode, stdout } = await runCli(cli, ['help', 'greet'])

    expect(quarry.usage).toHaveBeenCalledWith('greet')
    expect(stdout).toContain('Usage: quarry greet [name]')
    expect(stdout).toContain('(default: World)')
    expect(exitCode).toBe(0)
  })

  it('should write error to stderr for unknown command', async () => {
    const quarry = createMock<QuarryRegistry>()
    quarry.usage.mockRejectedValue(new CommandNotFoundError('nonexistent'))

    const cli = buildCli(quarry)
    const { exitCode, stderr } = await runCli(cli, ['help', 'nonexistent'])

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Unknown command: nonexistent')
  })

  it('should show custom listing when no command is given', async () => {
    const quarry = createMock<QuarryRegistry>()
    quarry.listUsage.mockResolvedValue(
      'Quarry CLI v0.0.1\n\nCommands\n  greet [name]\n    Greet someone',
    )

    const cli = buildCli(quarry)
    const { exitCode, stdout } = await runCli(cli, ['help'])

    expect(quarry.listUsage).toHaveBeenCalledWith({
      binaryName: 'quarry',
      binaryLabel: undefined,
      binaryVersion: undefined,
    })
    expect(quarry.usage).not.toHaveBeenCalled()
    expect(stdout).toContain('Quarry CLI')
    expect(stdout).toContain('greet')
    expect(exitCode).toBe(0)
  })

  it('should show custom listing when invoked via "list" path', async () => {
    const quarry = createMock<QuarryRegistry>()
    quarry.listUsage.mockResolvedValue('Quarry CLI\n\nCommands\n  db:seed [name]\n    Run seeders')

    const cli = buildCli(quarry)
    const { exitCode, stdout } = await runCli(cli, ['list'])

    expect(quarry.listUsage).toHaveBeenCalledWith(expect.objectContaining({ binaryName: 'quarry' }))
    expect(stdout).toContain('db:seed')
    expect(exitCode).toBe(0)
  })

  // The rethrown error is caught by Clipanion's default error handler,
  // which prints the message to stdout and returns exit code 1.
  it('should re-throw non-CommandNotFoundError errors', async () => {
    const quarry = createMock<QuarryRegistry>()
    quarry.usage.mockRejectedValue(new Error('unexpected'))

    const cli = buildCli(quarry)
    const { exitCode, stdout } = await runCli(cli, ['help', 'broken'])

    expect(exitCode).toBe(1)
    expect(stdout).toContain('unexpected')
  })
})
