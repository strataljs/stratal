import { createMock } from '@stratal/testing/mocks'
import { Cli, Command } from 'clipanion'
import { describe, expect, it } from 'vitest'
import type { Application } from '../../application'
import type { QuarryRegistry } from '../../quarry/quarry-registry'
import { parseSignature } from '../../quarry/signature-parser'
import { createDynamicCommands } from '../commands/dynamic-command'

function buildMockRegistry(...commands: { command: string; description?: string; aliases?: string[] }[]) {
  const entries = commands.map(cmd => {
    const sig = parseSignature(cmd.command)
    return { name: sig.name, description: cmd.description, aliases: cmd.aliases ?? [] }
  })

  const registry = createMock<QuarryRegistry>()
  registry.list.mockReturnValue(entries)
  registry.get.mockImplementation((name: string) =>
    commands.find(c => parseSignature(c.command).name === name) as ReturnType<QuarryRegistry['get']>,
  )

  return registry
}

function buildCli(signature: string, opts?: { description?: string; aliases?: string[] }) {
  const registry = buildMockRegistry({ command: signature, ...opts })
  const app = createMock<Application>()
  const dynamicCommands = createDynamicCommands(registry, parseSignature, app)
  const cli = new Cli()
  for (const cmd of dynamicCommands) {
    cli.register(cmd)
  }
  return { cli, dynamicCommands }
}

function getHelpOutput(signature: string, opts?: { description?: string; aliases?: string[] }) {
  const { cli } = buildCli(signature, opts)
  const sig = parseSignature(signature)
  const command = cli.process(sig.name.split(' '))
  return cli.usage(command, { detailed: true })
}

describe('createDynamicCommands', () => {
  describe('options', () => {
    it('should show default value for option with default', () => {
      const output = getHelpOutput('greet {--greeting=Hello}')
      expect(output).toContain('(default: Hello)')
    })

    it('should not show default text for option without default', () => {
      const output = getHelpOutput('greet {--greeting=}')
      expect(output).not.toContain('(default:')
    })

    it('should not show default text for flag option', () => {
      const output = getHelpOutput('greet {--verbose}')
      expect(output).not.toContain('(default:')
    })

    it('should show alias and default for option with alias', () => {
      const output = getHelpOutput('greet {--G|greeting=Hello}')
      expect(output).toContain('-G')
      expect(output).toContain('--greeting')
      expect(output).toContain('(default: Hello)')
    })

    it('should show both description and default for option', () => {
      const output = getHelpOutput('greet {--greeting=Hello : The greeting}')
      expect(output).toContain('The greeting')
      expect(output).toContain('(default: Hello)')
    })

    it('should only show defaults for options that have them', () => {
      const output = getHelpOutput('greet {name?} {--greeting=Hello} {--verbose}')
      expect(output).toContain('(default: Hello)')
      const matches = output.match(/\(default:/g)
      expect(matches).toHaveLength(1)
    })

    it('should pass default value to Option.String so Clipanion uses it', () => {
      const { cli } = buildCli('greet {--greeting=Hello}')
      const command = cli.process(['greet'])
      expect((command as unknown as Record<string, unknown>).greeting).toBe('Hello')
    })
  })

  describe('arguments', () => {
    it('should register optional positional arg for argument with default', () => {
      const output = getHelpOutput('greet {name=World}')
      // Clipanion renders positional args in the usage line
      expect(output).toContain('name')
      // The arg should not be required (no error thrown without it)
      const { cli } = buildCli('greet {name=World}')
      const command = cli.process(['greet'])
      expect(command).toBeInstanceOf(Command)
    })

    it('should register positional arg with user description and default', () => {
      const output = getHelpOutput('greet {name=World : The name}')
      expect(output).toContain('name')
      // The arg should not be required
      const { cli } = buildCli('greet {name=World : The name}')
      const command = cli.process(['greet'])
      expect(command).toBeInstanceOf(Command)
    })
  })

  describe('command creation', () => {
    it('should create commands with correct paths', () => {
      const { cli } = buildCli('db:seed {names*}', { description: 'Seed the database' })
      const command = cli.process(['db:seed', 'UsersSeeder'])
      expect(command).toBeInstanceOf(Command)
    })

    it('should create commands with aliases', () => {
      const { cli } = buildCli('db:seed {names*}', { aliases: ['seed'] })
      const command = cli.process(['seed', 'UsersSeeder'])
      expect(command).toBeInstanceOf(Command)
    })

    it('should create subcommands with space-separated paths', () => {
      const { cli } = buildCli('db seed {names*}')
      const command = cli.process(['db', 'seed', 'UsersSeeder'])
      expect(command).toBeInstanceOf(Command)
    })
  })
})
