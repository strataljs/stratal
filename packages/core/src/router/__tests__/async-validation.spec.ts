import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boolean, object, refine, string } from 'zod/mini'
import { Application } from '../../application'
import { getContainer } from '../../di/container-storage'
import { Singleton } from '../../di/decorators'
import type { StratalEnv } from '../../env'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Controller } from '../decorators/controller.decorator'
import { Route } from '../decorators/route.decorator'
import type { SchemaValidationError } from '../errors'
import type { RouterContext } from '../router-context'
import type { RouterEnv } from '../types'
import { createValidator } from '../validation/create-validator'

const lookups: string[] = []

@Singleton()
class RegistryService {
  private readonly taken = new Set(['taken@example.com'])

  async isAvailable(email: string): Promise<boolean> {
    lookups.push(email)
    await Promise.resolve()
    return !this.taken.has(email)
  }
}

const bodySchema = object({
  email: string().check(
    refine(
      async (value: string) => getContainer().resolve(RegistryService).isAvailable(value),
      { error: 'That email is already taken.' },
    ),
  ),
})

const syncSchema = object({ name: string() })

const asyncOnlySchema = object({
  code: string().check(
    refine(async (value: string) => Promise.resolve(value === 'ok'), { error: 'Unknown code.' }),
  ),
})

@Controller('/accounts')
class AccountsController {
  @Route({ body: bodySchema, response: object({ created: boolean() }) })
  create(ctx: RouterContext) {
    return ctx.json({ created: true }, 201)
  }
}

@Controller('/notes')
class NotesController {
  @Route({ body: syncSchema, response: object({ ok: boolean() }) })
  create(ctx: RouterContext) {
    return ctx.json({ ok: true }, 201)
  }
}

@Controller('/reports')
class ReportsController {
  @Route({
    response: object({
      total: string().check(refine(async (value: string) => Promise.resolve(value === 'ok'))),
    }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ total: 'not-ok' })
  }
}

@Module({
  controllers: [AccountsController, NotesController, ReportsController],
  providers: [RegistryService],
})
class AsyncValidationModule {}

const mockEnv = { ENVIRONMENT: 'test' } as StratalEnv
const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext

async function post(app: Application, path: string, body: unknown) {
  const hono = await app.ensureHono()
  return hono.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    mockEnv,
    mockCtx,
  )
}

describe('async schema validation', () => {
  let app: Application

  beforeEach(async () => {
    lookups.length = 0
    app = new Application({
      module: AsyncValidationModule,
      logging: { level: LogLevel.ERROR },
      env: mockEnv,
      ctx: { waitUntil: vi.fn() },
    })
    await app.initialize()
  })

  afterEach(async () => {
    await app.shutdown()
  })

  it('rejects with 400 rather than 500 when an async refinement fails', async () => {
    const res = await post(app, '/accounts', { email: 'taken@example.com' })

    expect(res.status).toBe(400)
  })

  it('carries the refinement message as a field issue', async () => {
    const hono = new Hono<RouterEnv>()
    const captured: SchemaValidationError[] = []

    hono.post('/', createValidator('json', asyncOnlySchema), (c) => c.json({ ok: true }))
    hono.onError((err) => {
      captured.push(err as SchemaValidationError)
      return new Response(null, { status: 400 })
    })

    await hono.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'nope' }),
      }),
    )

    expect(captured[0]?.issues).toEqual([
      { path: 'code', message: 'Unknown code.', code: 'custom' },
    ])
  })

  it('accepts a value the async refinement allows', async () => {
    const res = await post(app, '/accounts', { email: 'free@example.com' })

    expect(res.status).toBe(201)
  })

  it('resolves a provider from the request container inside the refinement', async () => {
    await post(app, '/accounts', { email: 'free@example.com' })

    expect(lookups).toEqual(['free@example.com'])
  })

  it('leaves a fully synchronous schema passing', async () => {
    const res = await post(app, '/notes', { name: 'a note' })

    expect(res.status).toBe(201)
  })

  it('still rejects a synchronous schema violation with 400', async () => {
    const res = await post(app, '/notes', { name: 42 })

    expect(res.status).toBe(400)
  })

  it('validates a response schema carrying an async refinement', async () => {
    const hono = await app.ensureHono()
    const res = await hono.fetch(new Request('http://localhost/reports'), mockEnv, mockCtx)

    expect(res.status).toBe(500)
  })
})
