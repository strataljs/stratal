import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application } from '../../application'
import type { StratalEnv } from '../../env'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Controller } from '../../router/decorators/controller.decorator'
import { Get } from '../../router/decorators/http-method.decorator'
import type { RouterContext } from '../../router/router-context'
import { BuiltinQuarryModule } from '../builtin-quarry.module'

/**
 * The command reaches the SDK through `await import(...)`, so there is no
 * injection seam — the module itself has to be intercepted. `createMock()`
 * supplies the INSTANCE behind that interception, so the assertions below read
 * as ordinary mock assertions instead of hand-rolled capture arrays.
 *
 * Everything before `connect()` — building the OpenAPI document from the active
 * request scope, which is the part that broke — runs for real.
 */
interface McpServerLike {
  registerTool(name: string, config: unknown, handler: unknown): void
  registerResource(name: string, uri: string, config: unknown, handler: unknown): void
  connect(transport: unknown): Promise<void>
}

let mcpServer: DeepMocked<McpServerLike>

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  // Returning an object from a constructor replaces the instance, so every
  // `new McpServer()` hands back the current mock.
  McpServer: class { constructor() { return mcpServer } },
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  // Not a `createMock()`: the command blocks on `await closed` until the
  // transport fires `onclose`, so this stub needs real control flow rather than
  // auto-mocked methods — an auto-mock would never resolve and the test would hang.
  class StubStdioServerTransport {
    onclose: (() => void) | null = null
    constructor() { setTimeout(() => this.onclose?.(), 0) }
  }
  return { StdioServerTransport: StubStdioServerTransport }
})

@Controller('/notes', { tags: ['notes'] })
class NotesController {
  @Get('/', { summary: 'List notes', name: 'notes.index' })
  index(ctx: RouterContext) {
    return ctx.json({ notes: [] })
  }
}

// `BuiltinQuarryModule` is what `QuarryRunner.run()` composes in to carry the
// framework's built-in commands; mirror that here rather than a bespoke wiring.
@Module({ imports: [BuiltinQuarryModule], controllers: [NotesController] })
class AppModule {}

/**
 * Runs commands through `Application.handleCommand` — the entry point the
 * `quarry` binary uses. It wraps every command in `runInRequestScope`, so this
 * exercises the real container topology rather than a hand-built mock, which is
 * what let `getSpec(app.container)` reach production.
 */
describe('Quarry commands (real Application)', () => {
  let app: Application

  beforeEach(() => {
    mcpServer = createMock<McpServerLike>()
  })

  beforeAll(async () => {
    app = new Application({
      module: AppModule,
      logging: { level: LogLevel.ERROR },
      env: { ENVIRONMENT: 'test' } as StratalEnv,
      ctx: { waitUntil: vi.fn() },
    })
    await app.initialize()
  })

  it('mcp:tools builds the OpenAPI document inside the request scope', async () => {
    const result = await app.handleCommand('mcp:tools', { tag: [], path: '' })

    expect(result.exitCode).toBe(0)
    expect(result.output.join('\n')).toContain('get_notes')
  })

  it('mcp:serve starts without a container-scope error', async () => {
    const result = await app.handleCommand('mcp:serve', { url: '', header: [], tag: [], path: '' })

    expect(result.exitCode).toBe(0)
    expect(mcpServer.connect).toHaveBeenCalled()
    expect(mcpServer.registerTool).toHaveBeenCalledWith('get_notes', expect.anything(), expect.anything())
  })

  it.each([
    ['route:list', { method: '', path: '', name: '', hidden: false }],
    ['event:list', {}],
    ['schedule:list', {}],
    ['queue:list', {}],
    ['i18n:stats', { prefix: '' }],
    ['i18n:namespaces', { depth: '', locale: '' }],
    ['help', {}],
  ])('%s exits cleanly', async (name, input) => {
    const result = await app.handleCommand(name, input)

    expect(result.errors).toEqual([])
    expect(result.exitCode).toBe(0)
  })
})
