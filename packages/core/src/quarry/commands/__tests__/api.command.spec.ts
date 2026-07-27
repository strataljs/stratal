import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from '../../../di/container';
import { Transient } from '../../../di/decorators';
import { DI_TOKENS } from '../../../di/tokens';
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals';
import { ApiCommand } from '../api.command';

let childContainer: Container

const mockHono = {
  fetch: async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname === '/api/notes' && request.method === 'GET') {
      return new Response(JSON.stringify([{ id: '1', title: 'Hello' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.pathname === '/api/notes' && request.method === 'POST') {
      const body = await request.text()
      return new Response(body, {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('Not Found', { status: 404 })
  },
}

const mockApp = {
  ensureHono: () => mockHono,
  env: {},
}

beforeEach(() => {
  childContainer = new Container()
  childContainer.registerValue(DI_TOKENS.Application, mockApp)

  Transient()(ApiCommand)
  childContainer.register(ApiCommand, ApiCommand)
})

function createCommand(input: Record<string, unknown> = {}): ApiCommand {
  const cmd = childContainer.resolve<ApiCommand>(ApiCommand)
  setCommandQuarry(cmd, { call: vi.fn().mockReturnValue({ exitCode: 0, output: [], errors: [] }) })
  setCommandInputs(cmd, { route: '', method: '', data: '', header: [], query: [], ...input })
  return cmd
}

describe('ApiCommand', () => {
  it('should delegate to route:list when no route argument provided', async () => {
    const mockCall = vi.fn().mockResolvedValue({ exitCode: 0, output: ['GET  /api/notes'], errors: [] })
    const cmd = createCommand()
    setCommandQuarry(cmd, { call: mockCall })

    const exitCode = await cmd.handle()

    expect(mockCall).toHaveBeenCalledWith('route:list', undefined)
    expect(exitCode).toBe(0)
    const result = getCommandResult(cmd)
    expect(result.output).toContain('GET  /api/notes')
  })

  it('should call route with default GET method', async () => {
    const cmd = createCommand({ route: '/api/notes' })
    const exitCode = await cmd.handle()

    expect(exitCode).toBe(0)
  })

  it('should call route with specified method and data', async () => {
    const cmd = createCommand({
      route: '/api/notes',
      method: 'POST',
      data: '{"title":"Test"}',
    })
    const exitCode = await cmd.handle()

    expect(exitCode).toBe(0)
  })

  it('should return exit code 1 for 4xx responses', async () => {
    const cmd = createCommand({ route: '/api/missing' })
    const exitCode = await cmd.handle()

    expect(exitCode).toBe(1)
  })

  it('should append query params to URL', async () => {
    const cmd = createCommand({
      route: '/api/notes',
      query: ['page=1', 'limit=10'],
    })
    const exitCode = await cmd.handle()

    expect(exitCode).toBe(0)
  })

  it('should parse header flags', async () => {
    const cmd = createCommand({
      route: '/api/notes',
      header: ['Authorization:Bearer token123'],
    })
    const exitCode = await cmd.handle()

    expect(exitCode).toBe(0)
  })

  it('should have the correct signature', () => {
    expect(ApiCommand.command).toContain('api {route?}')
  })

  it('should have api:call as an alias', () => {
    expect(ApiCommand.aliases).toContain('api:call')
  })
})
