import type { Context } from 'hono'
import { ApplicationError, ERROR_CODES } from 'stratal/errors'
import { type MessageKeys } from 'stratal/i18n'
import { RouterContext, SchemaValidationError } from 'stratal/router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InertiaModule } from '../inertia.module'
import { HandlePrecognitiveRequests } from '../middleware/handle-precognitive-requests.middleware'

function createMockContext(overrides: {
  headers?: Record<string, string>
} = {}): { ctx: RouterContext; c: ReturnType<typeof createMockHonoContext> } {
  const c = createMockHonoContext(overrides)
  return { ctx: new RouterContext(c as unknown as Context), c }
}

function createMockHonoContext(overrides: {
  headers?: Record<string, string>
} = {}) {
  const headers = new Headers(overrides.headers ?? {})
  const store = new Map<string, unknown>()

  return {
    req: {
      url: 'http://localhost/notes',
      method: 'POST',
      header: (name: string) => headers.get(name) ?? undefined,
    },
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: unknown) => { store.set(key, value) }),
    header: vi.fn(),
    status: vi.fn(),
    res: { status: 200 },
  }
}

function createMockExceptionContext(ctx: RouterContext) {
  return { type: 'http' as const, ctx }
}

function createSchemaError(issues: { path: string; message: string }[]) {
  const error = Object.create(SchemaValidationError.prototype)
  error.metadata = { issues }
  return error as SchemaValidationError
}

class TestApplicationError extends ApplicationError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message as MessageKeys, ERROR_CODES.VALIDATION.SCHEMA_VALIDATION, metadata)
  }
}

describe('Precognition', () => {
  describe('HandlePrecognitiveRequests middleware', () => {
    let middleware: HandlePrecognitiveRequests

    beforeEach(() => {
      middleware = new HandlePrecognitiveRequests()
    })

    it('sets precognition and validationSuccessResponse for precognition requests', async () => {
      const { ctx, c } = createMockContext({ headers: { precognition: 'true' } })

      await middleware.handle(ctx, vi.fn())

      expect(c.set).toHaveBeenCalledWith('precognition', true)
      expect(c.set).toHaveBeenCalledWith('validationSuccessResponse', expect.any(Response))

      const response = c.get('validationSuccessResponse') as Response
      expect(response.status).toBe(204)
      expect(response.headers.get('Precognition')).toBe('true')
      expect(response.headers.get('Precognition-Success')).toBe('true')
      expect(response.headers.get('Vary')).toBe('Precognition')
    })

    it('does not set validationSuccessResponse for non-precognition requests', async () => {
      const { ctx, c } = createMockContext()

      await middleware.handle(ctx, vi.fn())

      expect(c.set).toHaveBeenCalledWith('precognition', false)
      expect(c.set).not.toHaveBeenCalledWith('validationSuccessResponse', expect.anything())
    })

    it('calls next()', async () => {
      const { ctx } = createMockContext({ headers: { precognition: 'true' } })
      const next = vi.fn()

      await middleware.handle(ctx, next)

      expect(next).toHaveBeenCalled()
    })
  })

  describe('Exception handling', () => {
    let capturedHandlers: Map<unknown, (error: unknown, context: unknown) => Response | undefined>

    beforeEach(() => {
      const module = new InertiaModule()
      capturedHandlers = new Map()
      const mockHandler = {
        renderable: vi.fn((errorClass: unknown, handler: (error: unknown, context: unknown) => Response | undefined) => {
          capturedHandlers.set(errorClass, handler)
        }),
        errorPage: vi.fn(),
      }
      module.onException(mockHandler as never)
    })

    describe('SchemaValidationError with precognition', () => {
      it('returns 422 JSON with errors', () => {
        const { ctx } = createMockContext({ headers: { precognition: 'true' } })
        const context = createMockExceptionContext(ctx)
        const error = createSchemaError([
          { path: 'name', message: 'Name is required' },
          { path: 'email', message: 'Invalid email' },
        ])

        const response = capturedHandlers.get(SchemaValidationError)!(error, context)!

        expect(response.status).toBe(422)
        expect(response.headers.get('Precognition')).toBe('true')
        expect(response.headers.get('Content-Type')).toBe('application/json')
        expect(response.headers.get('Vary')).toBe('Precognition')

        return response.json<{ errors: Record<string, string> }>().then((body) => {
          expect(body.errors).toEqual({
            name: 'Name is required',
            email: 'Invalid email',
          })
        })
      })

      it('filters errors to Precognition-Validate-Only fields', () => {
        const { ctx } = createMockContext({
          headers: { precognition: 'true', 'precognition-validate-only': 'name' },
        })
        const context = createMockExceptionContext(ctx)
        const error = createSchemaError([
          { path: 'name', message: 'Name is required' },
          { path: 'email', message: 'Invalid email' },
        ])

        const response = capturedHandlers.get(SchemaValidationError)!(error, context)!

        expect(response.status).toBe(422)

        return response.json<{ errors: Record<string, string> }>().then((body) => {
          expect(body.errors).toEqual({ name: 'Name is required' })
          expect(body.errors).not.toHaveProperty('email')
        })
      })

      it('returns 204 success when Precognition-Validate-Only fields have no errors', () => {
        const { ctx } = createMockContext({
          headers: { precognition: 'true', 'precognition-validate-only': 'title' },
        })
        const context = createMockExceptionContext(ctx)
        const error = createSchemaError([
          { path: 'name', message: 'Name is required' },
          { path: 'email', message: 'Invalid email' },
        ])

        const response = capturedHandlers.get(SchemaValidationError)!(error, context)!

        expect(response.status).toBe(204)
        expect(response.headers.get('Precognition')).toBe('true')
        expect(response.headers.get('Precognition-Success')).toBe('true')
        expect(response.body).toBeNull()
      })

      it('handles multiple Precognition-Validate-Only fields', () => {
        const { ctx } = createMockContext({
          headers: { precognition: 'true', 'precognition-validate-only': 'name, email' },
        })
        const context = createMockExceptionContext(ctx)
        const error = createSchemaError([
          { path: 'name', message: 'Name is required' },
          { path: 'email', message: 'Invalid email' },
          { path: 'age', message: 'Age must be a number' },
        ])

        const response = capturedHandlers.get(SchemaValidationError)!(error, context)!

        expect(response.status).toBe(422)

        return response.json<{ errors: Record<string, string> }>().then((body) => {
          expect(body.errors).toEqual({
            name: 'Name is required',
            email: 'Invalid email',
          })
          expect(body.errors).not.toHaveProperty('age')
        })
      })
    })

    describe('ApplicationError with precognition', () => {
      it('returns 422 JSON with _form error', () => {
        const mockI18n = { t: vi.fn().mockReturnValue('Translated error message') }
        const mockContainer = { resolve: vi.fn().mockReturnValue(mockI18n) }
        const { ctx } = createMockContext({ headers: { precognition: 'true' } })
        ;(ctx as unknown as { getContainer: () => unknown }).getContainer = () => mockContainer

        const context = createMockExceptionContext(ctx)
        const error = new TestApplicationError('errors.testError', { key: 'value' })

        const response = capturedHandlers.get(ApplicationError)!(error, context)!

        expect(response.status).toBe(422)
        expect(response.headers.get('Precognition')).toBe('true')
        expect(response.headers.get('Content-Type')).toBe('application/json')

        return response.json<{ errors: Record<string, string> }>().then((body) => {
          expect(body.errors).toEqual({ _form: 'Translated error message' })
        })
      })
    })

    describe('Non-precognition requests (no regression)', () => {
      it('returns undefined for non-inertia, non-precognition validation errors', () => {
        const { ctx } = createMockContext()
        const context = createMockExceptionContext(ctx)
        const error = createSchemaError([{ path: 'name', message: 'Required' }])

        const result = capturedHandlers.get(SchemaValidationError)!(error, context)

        expect(result).toBeUndefined()
      })

      it('returns redirect for inertia validation errors without precognition', () => {
        const redirectMock = vi.fn().mockReturnValue(new Response(null, { status: 303 }))
        const { ctx } = createMockContext({ headers: { 'x-inertia': 'true', referer: 'http://localhost/notes' } })
        ;(ctx as unknown as { flash: (key: string, value: unknown) => void }).flash = vi.fn()
        ;(ctx as unknown as { redirect: (url: string, status: number) => Response }).redirect = redirectMock

        const context = createMockExceptionContext(ctx)
        const error = createSchemaError([{ path: 'name', message: 'Required' }])

        const response = capturedHandlers.get(SchemaValidationError)!(error, context)!

        expect(response.status).toBe(303)
      })
    })
  })
})
