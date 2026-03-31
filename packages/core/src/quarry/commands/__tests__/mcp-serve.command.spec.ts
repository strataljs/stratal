import 'reflect-metadata'

import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from '../../../di/container'
import { DI_TOKENS } from '../../../di/tokens'
import { OPENAPI_TOKENS } from '../../../openapi/openapi.tokens'
import { setCommandInputs, setCommandQuarry } from '../../command-internals'
import type { QuarryRegistry } from '../../quarry-registry'
import { McpServeCommand } from '../mcp-serve.command'

// Track registered tools and resources
let registeredTools: { name: string; description: string }[] = []
let registeredResources: { name: string; uri: string }[] = []
let connectCalled = false

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    registerTool(name: string, config: { description?: string }) {
      registeredTools.push({ name, description: config.description ?? '' })
    }
    registerResource(name: string, uri: string) {
      registeredResources.push({ name, uri })
    }
    connect() {
      connectCalled = true
    }
  }
  return { McpServer: MockMcpServer }
})

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  class MockStdioServerTransport {
    onclose: (() => void) | null = null
    constructor() {
      setTimeout(() => this.onclose?.(), 0)
    }
  }
  return { StdioServerTransport: MockStdioServerTransport }
})

let stderrSpy: ReturnType<typeof vi.spyOn>
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

const mockConfigService = {
  getEffectiveConfig: () => ({ info: { title: 'Test API', version: '1.0.0' } }),
}

const mockContainer = {
  resolve: (token: symbol) => {
    if (token === OPENAPI_TOKENS.ConfigService) return mockConfigService
    return undefined
  },
}

const mockHono = {
  fetch: vi.fn().mockResolvedValue(new Response('ok')),
}

const mockApp = {
  ensureHono: () => mockHono,
  env: {},
  container: mockContainer,
}

beforeEach(() => {
  registeredTools = []
  registeredResources = []
  connectCalled = false
  stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

  const tsyringe = tsyringeRootContainer.createChildContainer()
  childContainer = new Container({ container: tsyringe })
  childContainer.registerValue(DI_TOKENS.Application, mockApp)
  childContainer.registerValue(OPENAPI_TOKENS.OpenAPIService, mockOpenAPIService)

  injectable()(McpServeCommand)
  childContainer.register(McpServeCommand, McpServeCommand)
})

afterEach(() => {
  stderrSpy.mockRestore()
})

function createCommand(input: Record<string, unknown> = {}): McpServeCommand {
  const cmd = childContainer.resolve<McpServeCommand>(McpServeCommand)
  setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
  setCommandInputs(cmd, { url: '', header: [], tag: [], path: '', ...input })
  return cmd
}

describe('McpServeCommand', () => {
  it('should register all tools from the OpenAPI spec', async () => {
    const cmd = createCommand()
    await cmd.handle()

    expect(registeredTools).toHaveLength(3)
    expect(registeredTools.map((t) => t.name)).toEqual(['listNotes', 'createNote', 'listUsers'])
    expect(connectCalled).toBe(true)
  })

  it('should register the OpenAPI spec as a resource', async () => {
    const cmd = createCommand()
    await cmd.handle()

    expect(registeredResources).toHaveLength(1)
    expect(registeredResources[0].name).toBe('openapi-spec')
    expect(registeredResources[0].uri).toBe('openapi://spec')
  })

  it('should respect tag filter', async () => {
    const cmd = createCommand({ tag: ['users'] })
    await cmd.handle()

    expect(registeredTools).toHaveLength(1)
    expect(registeredTools[0].name).toBe('listUsers')
  })

  it('should respect path filter', async () => {
    const cmd = createCommand({ path: '/api/notes' })
    await cmd.handle()

    expect(registeredTools).toHaveLength(2)
    expect(registeredTools.map((t) => t.name)).toEqual(['listNotes', 'createNote'])
  })

  it('should parse header flags', async () => {
    const cmd = createCommand({
      url: 'https://api.example.com',
      header: ['Authorization:Bearer tok123', 'X-Custom:value'],
    })
    await cmd.handle()

    // Just verify it runs without error — headers are used in dispatcher
    expect(registeredTools).toHaveLength(3)
  })

  it('should write tool count to stderr', async () => {
    const cmd = createCommand()
    await cmd.handle()

    expect(stderrSpy).toHaveBeenCalledWith('MCP server started with 3 tool(s)\n')
  })

  it('should have the correct signature', () => {
    expect(McpServeCommand.command).toContain('mcp:serve')
  })
})
