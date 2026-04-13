import 'reflect-metadata'

import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { beforeEach, describe, expect, it } from 'vitest'
import { Container } from '../../../di/container'
import { DI_TOKENS } from '../../../di/tokens'
import { OPENAPI_TOKENS } from '../../../openapi/openapi.tokens'
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals'
import type { QuarryRegistry } from '../../quarry-registry'
import { McpToolsCommand } from '../mcp-tools.command'

let childContainer: Container

const testSpec = {
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/api/notes': {
      get: {
        operationId: 'listNotes',
        summary: 'List notes',
        tags: ['notes'],
      },
      post: {
        operationId: 'createNote',
        summary: 'Create a note',
        tags: ['notes'],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
      },
    },
    '/api/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List users',
        tags: ['users'],
      },
    },
  },
}

const mockOpenAPIService = {
  getSpec: () => testSpec,
}

const mockApp = {
  ensureHono: () => ({}),
  container: {},
}

beforeEach(() => {
  const tsyringe = tsyringeRootContainer.createChildContainer()
  childContainer = new Container({ container: tsyringe })
  childContainer.registerValue(DI_TOKENS.Application, mockApp)
  childContainer.registerValue(OPENAPI_TOKENS.OpenAPIService, mockOpenAPIService)

  injectable()(McpToolsCommand)
  childContainer.register(McpToolsCommand, McpToolsCommand)
})

function createCommand(input: Record<string, unknown> = {}): McpToolsCommand {
  const cmd = childContainer.resolve<McpToolsCommand>(McpToolsCommand)
  setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
  setCommandInputs(cmd, { tag: [], path: '', ...input })
  return cmd
}

describe('McpToolsCommand', () => {
  it('should list all tools as a table', async () => {
    const cmd = createCommand()
    const exitCode = await cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    const output = result.output.join('\n')
    expect(output).toContain('listNotes')
    expect(output).toContain('createNote')
    expect(output).toContain('listUsers')
    expect(output).toContain('GET')
    expect(output).toContain('POST')
  })

  it('should filter by tag', async () => {
    const cmd = createCommand({ tag: ['users'] })
    const exitCode = await cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    const output = result.output.join('\n')
    expect(output).toContain('listUsers')
    expect(output).not.toContain('listNotes')
  })

  it('should filter by path prefix', async () => {
    const cmd = createCommand({ path: '/api/notes' })
    const exitCode = await cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    const output = result.output.join('\n')
    expect(output).toContain('listNotes')
    expect(output).toContain('createNote')
    expect(output).not.toContain('listUsers')
  })

  it('should show "No tools found" when filters match nothing', async () => {
    const cmd = createCommand({ tag: ['nonexistent'] })
    const exitCode = await cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    const output = result.output.join('\n')
    expect(output).toContain('No tools found')
  })

  it('should have the correct signature', () => {
    expect(McpToolsCommand.command).toBe('mcp:tools {--tag=* : Filter by OpenAPI tags} {--path= : Filter by path prefix}')
  })
})
