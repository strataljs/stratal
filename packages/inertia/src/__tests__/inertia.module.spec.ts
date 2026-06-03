import type { Context } from 'hono'
import type { ErrorResponse } from 'stratal/errors'
import { RouterContext } from 'stratal/router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InertiaModule } from '../inertia.module'
import { INERTIA_TOKENS } from '../inertia.tokens'

type ErrorPageCb = (
  errorResponse: ErrorResponse,
  status: number,
  context: { type: 'http', ctx: RouterContext },
  error: unknown,
) => Promise<Response | undefined>

function createMockHonoContext() {
  const store = new Map<string, unknown>()
  return {
    req: { url: 'http://localhost/widgets', method: 'GET', header: () => undefined },
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: unknown) => { store.set(key, value) }),
    header: vi.fn(),
    status: vi.fn(),
    res: { status: 200 },
  }
}

describe('InertiaModule onException — errorPage', () => {
  let module: InertiaModule
  let captured: ErrorPageCb | undefined

  beforeEach(() => {
    module = new InertiaModule()
    captured = undefined
    const mockHandler = {
      renderable: vi.fn(),
      errorPage: vi.fn((cb: ErrorPageCb) => { captured = cb }),
    }
    module.onException(mockHandler as never)
  })

  it('registers an errorPage callback', () => {
    expect(captured).toBeDefined()
  })

  it('renders Errors/${status} through InertiaService with the resolved status', async () => {
    const renderSpy = vi.fn().mockResolvedValue(new Response('inertia-error', { status: 404 }))
    const inertia = { render: renderSpy }
    const container = {
      resolve: vi.fn((token: symbol) => {
        if (token === INERTIA_TOKENS.InertiaService) return inertia
        throw new Error(`unexpected token: ${String(token)}`)
      }),
    }
    const ctx = new RouterContext(createMockHonoContext() as unknown as Context)
    ;(ctx as unknown as { getContainer: () => unknown }).getContainer = () => container

    const errorResponse = {
      message: 'Route not found',
      timestamp: '2026-01-01T00:00:00.000Z',
    } as ErrorResponse

    const response = await captured!(errorResponse, 404, { type: 'http', ctx }, new Error('boom'))

    expect(response?.status).toBe(404)
    expect(renderSpy).toHaveBeenCalledOnce()
    const [calledCtx, component, props, options] = renderSpy.mock.calls[0]
    expect(calledCtx).toBe(ctx)
    expect(component).toBe('Errors/404')
    expect(props).toEqual({
      status: 404,
      message: 'Route not found',
    })
    expect(options).toEqual({ status: 404 })
  })

  it('passes the correct status component name for other statuses (500, 503)', async () => {
    const renderSpy = vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    const inertia = { render: renderSpy }
    const container = { resolve: vi.fn().mockReturnValue(inertia) }
    const ctx = new RouterContext(createMockHonoContext() as unknown as Context)
    ;(ctx as unknown as { getContainer: () => unknown }).getContainer = () => container

    const errorResponse = { message: 'Internal Server Error', timestamp: '' } as ErrorResponse

    await captured!(errorResponse, 500, { type: 'http', ctx }, new Error())
    expect(renderSpy.mock.calls[0][1]).toBe('Errors/500')

    renderSpy.mockClear()
    await captured!(errorResponse, 503, { type: 'http', ctx }, new Error())
    expect(renderSpy.mock.calls[0][1]).toBe('Errors/503')
  })

  it('returns undefined when InertiaService.render() throws (missing error page)', async () => {
    const renderSpy = vi.fn().mockRejectedValue(new Error('Page not found: Errors/500'))
    const inertia = { render: renderSpy }
    const container = { resolve: vi.fn().mockReturnValue(inertia) }
    const ctx = new RouterContext(createMockHonoContext() as unknown as Context)
    ;(ctx as unknown as { getContainer: () => unknown }).getContainer = () => container

    const errorResponse = { message: 'Internal Server Error', timestamp: '' } as ErrorResponse

    const result = await captured!(errorResponse, 500, { type: 'http', ctx }, new Error())
    expect(result).toBeUndefined()
  })
})
