import 'reflect-metadata'

import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from '../../di/container'
import { DI_TOKENS } from '../../di/tokens'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import type { MessageKeys } from '../../i18n/i18n.types'
import { LOGGER_TOKENS } from '../../logger'
import { ApplicationError } from '../application-error'
import { DefaultExceptionHandler } from '../default-exception-handler'
import { ERROR_CODES, type ErrorCode } from '../error-codes'
import type { ErrorResponse } from '../error-response'
import type { ExceptionContext } from '../exception-context'
import { createCliExceptionContext, createCronExceptionContext, createHttpExceptionContext, createQueueExceptionContext } from '../exception-context'
import { ExceptionHandler } from '../exception-handler'
import { HttpException } from '../http-exception'
import { InternalError } from '../internal-error'

// ── Test Fixtures ───────────────────────────────────────────────────

class TestError extends ApplicationError {
  constructor(message = 'errors.testError', code: number = ERROR_CODES.VALIDATION.GENERIC) {
    super(message as MessageKeys, code as ErrorCode, { detail: 'test' })
  }
}

class ChildTestError extends TestError {
  constructor() {
    super('errors.childError', ERROR_CODES.VALIDATION.GENERIC)
  }
}

class SelfReportingError extends HttpException {
  reportCalled = false

  constructor() {
    super(422, 'errors.selfReporting')
  }

  report(): void {
    this.reportCalled = true
  }
}

class SelfReportingWithFallback extends HttpException {
  constructor() {
    super(422, 'errors.selfReportingFallback')
  }

  report(): false {
    return false
  }
}

class SelfRenderingError extends HttpException {
  constructor() {
    super(503, 'errors.selfRendering')
  }

  render(ctx: ExceptionContext): Response | undefined {
    if (ctx.type === 'http') {
      return new Response('custom render', { status: 503 })
    }
    return undefined
  }
}

// ── Test Setup ──────────────────────────────────────────────────────

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}

const mockI18n = {
  t: vi.fn((key: string) => `translated:${key}`),
  getLocale: vi.fn(() => 'en'),
}

const mockWaitUntil = vi.fn((p: Promise<unknown>) => {
  p.catch(() => {
    //
  })
})
const mockExecutionContext = { waitUntil: mockWaitUntil }

function createHandler(HandlerClass: typeof ExceptionHandler = DefaultExceptionHandler): ExceptionHandler {
  const childContainer = tsyringeRootContainer.createChildContainer()
  const container = new Container({ container: childContainer })

  container.registerValue(LOGGER_TOKENS.LoggerService, mockLogger)
  container.registerValue(DI_TOKENS.CloudflareEnv, { ENVIRONMENT: 'test' })
  container.registerValue(DI_TOKENS.ExecutionContext, mockExecutionContext)
  container.registerValue(I18N_TOKENS.I18nService, mockI18n)

  // Ensure tsyringe has decorator metadata for the handler class
  injectable()(HandlerClass as never)
  container.register(DI_TOKENS.ExceptionHandler, HandlerClass as never)
  const handler = container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
  handler.register()
  return handler
}

describe('ExceptionHandler', () => {
  const cliCtx = createCliExceptionContext('test-cmd')

  function createMockHonoCtx(options: { accept?: string } = {}) {
    return {
      req: {
        method: 'GET',
        header: (name: string) => {
          if (name === 'accept') return options.accept
          return undefined
        },
      },
    } as never
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Default Behavior ────────────────────────────────────────────

  describe('default handling', () => {
    it('should normalize non-ApplicationError into InternalError', async () => {
      const handler = createHandler()
      const response = await handler.handle('some string error', cliCtx)

      expect(response).toBeInstanceOf(Response)
      const body: Record<string, unknown> = await response.json()
      expect(body.code).toBe(ERROR_CODES.SYSTEM.INTERNAL_ERROR)
    })

    it('should translate and render ApplicationError as JSON', async () => {
      const handler = createHandler()
      const error = new TestError()
      const response = await handler.handle(error, cliCtx)

      const body: Record<string, unknown> = await response.json()
      expect(body.code).toBe(ERROR_CODES.VALIDATION.GENERIC)
      expect(body.message).toBe('translated:errors.testError')
    })

    it('should set correct HTTP status from error code', async () => {
      const handler = createHandler()
      const error = new TestError('errors.notFound', ERROR_CODES.RESOURCE.NOT_FOUND)
      const response = await handler.handle(error, cliCtx)

      expect(response.status).toBe(404)
    })

    it('should use HttpException httpStatus for status code', async () => {
      const handler = createHandler()
      const error = new HttpException(418 as never, 'Teapot')
      const response = await handler.handle(error, cliCtx)

      expect(response.status).toBe(418)
    })

    it('should report via waitUntil', async () => {
      const handler = createHandler()
      await handler.handle(new TestError(), cliCtx)

      expect(mockWaitUntil).toHaveBeenCalledOnce()
    })

    it('should log with correct severity for validation errors (info)', async () => {
      const handler = createHandler()
      await handler.handle(new TestError('errors.val', ERROR_CODES.VALIDATION.GENERIC), cliCtx)

      // waitUntil fires the promise; flush it
      await mockWaitUntil.mock.calls[0][0]
      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('should log with correct severity for system errors (error)', async () => {
      const handler = createHandler()
      await handler.handle(new InternalError(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  // ── reportable() ───────────────────────────────────────────────

  describe('reportable', () => {
    it('should call custom reporter for matching error', async () => {
      const spy = vi.fn()

      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.reportable(TestError, spy)
        }
      }

      const handler = createHandler(CustomHandler)
      await handler.handle(new TestError(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(spy).toHaveBeenCalledOnce()
    })

    it('should still run default logger when .stop() is not called', async () => {
      const spy = vi.fn()

      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.reportable(TestError, spy)
        }
      }

      const handler = createHandler(CustomHandler)
      await handler.handle(new TestError(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(spy).toHaveBeenCalledOnce()
      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('should skip default logger when .stop() is called', async () => {
      const spy = vi.fn()

      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.reportable(TestError, spy).stop()
        }
      }

      const handler = createHandler(CustomHandler)
      await handler.handle(new TestError(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(spy).toHaveBeenCalledOnce()
      expect(mockLogger.info).not.toHaveBeenCalled()
      expect(mockLogger.error).not.toHaveBeenCalled()
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    it('should match most-specific class (subclass over base)', async () => {
      const baseSpy = vi.fn()
      const childSpy = vi.fn()

      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.reportable(TestError, baseSpy)
          this.reportable(ChildTestError, childSpy)
        }
      }

      const handler = createHandler(CustomHandler)
      await handler.handle(new ChildTestError(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(childSpy).toHaveBeenCalledOnce()
      expect(baseSpy).not.toHaveBeenCalled()
    })
  })

  // ── renderable() ──────────────────────────────────────────────

  describe('renderable', () => {
    it('should use custom renderer for matching error', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.renderable(TestError, () => {
            return new Response('custom', { status: 422 })
          })
        }
      }

      const handler = createHandler(CustomHandler)
      const response = await handler.handle(new TestError(), cliCtx)

      expect(response.status).toBe(422)
      expect(await response.text()).toBe('custom')
    })

    it('should fall through to default when renderer returns undefined', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.renderable(TestError, () => undefined)
        }
      }

      const handler = createHandler(CustomHandler)
      const response = await handler.handle(new TestError(), cliCtx)
      const body: Record<string, unknown> = await response.json()

      expect(body.code).toBe(ERROR_CODES.VALIDATION.GENERIC)
    })
  })

  // ── dontReport() ──────────────────────────────────────────────

  describe('dontReport', () => {
    it('should suppress reporting for listed errors', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.dontReport([TestError])
        }
      }

      const handler = createHandler(CustomHandler)
      await handler.handle(new TestError(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(mockLogger.info).not.toHaveBeenCalled()
      expect(mockLogger.error).not.toHaveBeenCalled()
    })

    it('should still render the error response', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.dontReport([TestError])
        }
      }

      const handler = createHandler(CustomHandler)
      const response = await handler.handle(new TestError(), cliCtx)
      const body: Record<string, unknown> = await response.json()

      expect(body.code).toBe(ERROR_CODES.VALIDATION.GENERIC)
    })
  })

  // ── level() ───────────────────────────────────────────────────

  describe('level', () => {
    it('should override log severity for specific error', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.level(TestError, 'debug')
        }
      }

      const handler = createHandler(CustomHandler)
      await handler.handle(new TestError(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(mockLogger.debug).toHaveBeenCalled()
      expect(mockLogger.info).not.toHaveBeenCalled()
    })
  })

  // ── context() ─────────────────────────────────────────────────

  describe('context', () => {
    it('should merge global context into log entries', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.context(() => ({ appVersion: '1.0.0' }))
        }
      }

      const handler = createHandler(CustomHandler)
      await handler.handle(new TestError(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      const logCall = mockLogger.info.mock.calls[0]
      expect(logCall[1]).toMatchObject({ appVersion: '1.0.0' })
    })
  })

  // ── respond() ─────────────────────────────────────────────────

  describe('respond', () => {
    it('should post-process the response', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.respond((response, error) => {
            response.headers.set('X-Error-Code', String(error.code))
            return response
          })
        }
      }

      const handler = createHandler(CustomHandler)
      const response = await handler.handle(new TestError(), cliCtx)

      expect(response.headers.get('X-Error-Code')).toBe(String(ERROR_CODES.VALIDATION.GENERIC))
    })

    it('should chain multiple respond callbacks', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.respond((res) => {
            res.headers.set('X-First', 'true')
            return res
          })
          this.respond((res) => {
            res.headers.set('X-Second', 'true')
            return res
          })
        }
      }

      const handler = createHandler(CustomHandler)
      const response = await handler.handle(new TestError(), cliCtx)

      expect(response.headers.get('X-First')).toBe('true')
      expect(response.headers.get('X-Second')).toBe('true')
    })
  })

  // ── Self-reporting / Self-rendering ───────────────────────────

  describe('self-reporting', () => {
    it('should call error.report() and skip default logging', async () => {
      const handler = createHandler()
      const error = new SelfReportingError()
      await handler.handle(error, cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(error.reportCalled).toBe(true)
      expect(mockLogger.info).not.toHaveBeenCalled()
      expect(mockLogger.warn).not.toHaveBeenCalled()
      expect(mockLogger.error).not.toHaveBeenCalled()
    })

    it('should also run default logging when report() returns false', async () => {
      const handler = createHandler()
      await handler.handle(new SelfReportingWithFallback(), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      // Returns false → default reporting also runs
      expect(mockLogger.info).toHaveBeenCalled()
    })
  })

  describe('self-rendering', () => {
    it('should use error.render() when it returns a Response', async () => {
      const handler = createHandler()
      const httpCtx = createHttpExceptionContext(createMockHonoCtx())

      const response = await handler.handle(new SelfRenderingError(), httpCtx)

      expect(response.status).toBe(503)
      expect(await response.text()).toBe('custom render')
    })

    it('should fall back to default when render() returns undefined (non-HTTP)', async () => {
      const handler = createHandler()
      const response = await handler.handle(new SelfRenderingError(), cliCtx)

      // In CLI context, render() returns undefined → default rendering
      const body: Record<string, unknown> = await response.json()
      expect(body.code).toBe(ERROR_CODES.SYSTEM.INTERNAL_ERROR)
    })
  })

  // ── Priority ──────────────────────────────────────────────────

  describe('priority', () => {
    it('self-report takes precedence over registered reportable', async () => {
      const spy = vi.fn()

      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.reportable(SelfReportingError, spy)
        }
      }

      const handler = createHandler(CustomHandler)
      const error = new SelfReportingError()
      await handler.handle(error, cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(error.reportCalled).toBe(true)
      expect(spy).not.toHaveBeenCalled()
    })

    it('self-render takes precedence over registered renderable', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.renderable(SelfRenderingError, () => new Response('from-renderable', { status: 500 }))
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx())

      const response = await handler.handle(new SelfRenderingError(), httpCtx)
      expect(await response.text()).toBe('custom render')
    })
  })

  // ── Context types ─────────────────────────────────────────────

  describe('context types', () => {
    it('should handle errors in queue context', async () => {
      const handler = createHandler()
      const queueCtx = createQueueExceptionContext('my-queue')
      const response = await handler.handle(new TestError(), queueCtx)

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(400)
    })

    it('should handle errors in cron context', async () => {
      const handler = createHandler()
      const cronCtx = createCronExceptionContext()
      const response = await handler.handle(new InternalError(), cronCtx)

      expect(response.status).toBe(500)
    })

    it('should handle errors in CLI context', async () => {
      const handler = createHandler()
      const response = await handler.handle(new TestError(), cliCtx)

      expect(response.status).toBe(400)
    })
  })

  // ── Translation ───────────────────────────────────────────────

  describe('translation', () => {
    it('should translate i18n keys via i18n service', async () => {
      const handler = createHandler()
      const response = await handler.handle(new TestError('errors.myKey'), cliCtx)
      const body: Record<string, unknown> = await response.json()

      expect(body.message).toBe('translated:errors.myKey')
      expect(mockI18n.t).toHaveBeenCalledWith('errors.myKey', { detail: 'test' })
    })

    it('should fall back to raw message when i18n is unavailable', async () => {
      // Create handler without I18n registered
      const childContainer = tsyringeRootContainer.createChildContainer()
      const container = new Container({ container: childContainer })
      container.registerValue(LOGGER_TOKENS.LoggerService, mockLogger)
      container.registerValue(DI_TOKENS.CloudflareEnv, { ENVIRONMENT: 'test' })
      container.registerValue(DI_TOKENS.ExecutionContext, mockExecutionContext)
      // No I18N_TOKENS.I18nService registered

      container.registerSingleton(DI_TOKENS.ExceptionHandler, DefaultExceptionHandler as never)
      const handler = container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
      handler.register()

      const response = await handler.handle(new HttpException(404, 'Not Found'), cliCtx)
      const body: Record<string, unknown> = await response.json()

      expect(body.message).toBe('Not Found')
    })
  })

  // ── resolve() ─────────────────────────────────────────────────

  describe('resolve', () => {
    it('should resolve services from the DI container', () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          const logger = this.resolve(LOGGER_TOKENS.LoggerService)
          expect(logger).toBe(mockLogger)
        }
      }

      createHandler(CustomHandler)
    })
  })

  // ── Content Negotiation ────────────────────────────────────────

  describe('content negotiation', () => {
    it('should return JSON for requests without Accept: text/html', async () => {
      const handler = createHandler()
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'application/json' }))
      const response = await handler.handle(new TestError(), httpCtx)

      expect(response.headers.get('content-type')).toContain('application/json')
      const body: Record<string, unknown> = await response.json()
      expect(body.code).toBe(ERROR_CODES.VALIDATION.GENERIC)
    })

    it('should return HTML for Inertia XHR Accept header (text/html, application/xhtml+xml)', async () => {
      const handler = createHandler()
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({
        accept: 'text/html, application/xhtml+xml',
      }))
      const response = await handler.handle(new HttpException(500), httpCtx)

      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    })

    it('should return HTML for requests with Accept: text/html (non-dev)', async () => {
      const handler = createHandler()
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(404, 'Page Not Found'), httpCtx)

      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(response.status).toBe(404)
      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('404')
      expect(html).toContain('Page Not Found')
    })

    it('should return minimal branded HTML in production', async () => {
      // createHandler uses ENVIRONMENT: 'test', which is non-development
      const handler = createHandler()
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(500), httpCtx)

      const html = await response.text()
      expect(html).toContain('#13c397') // brand color
      expect(html).toContain('500')
    })

    it('should return HTML error page in development environment for HTML requests', async () => {
      // Override environment to development
      const childContainer = tsyringeRootContainer.createChildContainer()
      const container = new Container({ container: childContainer })
      container.registerValue(LOGGER_TOKENS.LoggerService, mockLogger)
      container.registerValue(DI_TOKENS.CloudflareEnv, { ENVIRONMENT: 'development' })
      container.registerValue(DI_TOKENS.ExecutionContext, mockExecutionContext)
      container.registerValue(I18N_TOKENS.I18nService, mockI18n)
      injectable()(DefaultExceptionHandler as never)
      container.register(DI_TOKENS.ExceptionHandler, DefaultExceptionHandler as never)
      const handler = container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
      handler.register()

      const error = new HttpException(500, 'Server Error')
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(error, httpCtx)
      expect(response.status).toBe(500)
      expect(response.headers.get('content-type')).toContain('text/html')
      const html = await response.text()
      expect(html).toContain('500')
    })

    it('should return HTML error page in development environment for plain Error', async () => {
      const childContainer = tsyringeRootContainer.createChildContainer()
      const container = new Container({ container: childContainer })
      container.registerValue(LOGGER_TOKENS.LoggerService, mockLogger)
      container.registerValue(DI_TOKENS.CloudflareEnv, { ENVIRONMENT: 'development' })
      container.registerValue(DI_TOKENS.ExecutionContext, mockExecutionContext)
      container.registerValue(I18N_TOKENS.I18nService, mockI18n)
      injectable()(DefaultExceptionHandler as never)
      container.register(DI_TOKENS.ExceptionHandler, DefaultExceptionHandler as never)
      const handler = container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
      handler.register()

      const error = new Error('boom')
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(error, httpCtx)
      expect(response.status).toBe(500)
      expect(response.headers.get('content-type')).toContain('text/html')
      const html = await response.text()
      expect(html).toContain('boom')
    })

    it('should return JSON for non-HTTP contexts regardless of error type', async () => {
      const handler = createHandler()
      const response = await handler.handle(new TestError(), cliCtx)

      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should return JSON when Accept header is missing', async () => {
      const handler = createHandler()
      const httpCtx = createHttpExceptionContext(createMockHonoCtx())
      const response = await handler.handle(new TestError(), httpCtx)

      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should escape HTML in error messages for production HTML', async () => {
      const handler = createHandler()
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(400, '<script>alert("xss")</script>'), httpCtx)

      const html = await response.text()
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('custom renderable should take priority over content negotiation', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.renderable(TestError, () => new Response('custom', { status: 422 }))
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new TestError(), httpCtx)

      expect(await response.text()).toBe('custom')
      expect(response.status).toBe(422)
    })
  })

  // ── errorPage() ───────────────────────────────────────────────

  describe('errorPage', () => {
    it('receives translated errorResponse, status, context, and error', async () => {
      const spy = vi.fn(
        (_errorResponse: ErrorResponse, _status: number, _context: ExceptionContext, _err: ApplicationError) =>
          new Response('rendered', { status: 404 }),
      )

      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(spy)
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const error = new HttpException(404, 'errors.notFound')

      const response = await handler.handle(error, httpCtx)

      expect(spy).toHaveBeenCalledOnce()
      const [errorResponse, status, context, errArg] = spy.mock.calls[0]
      expect(errorResponse.code).toBe(error.code)
      // The mock RouterContext has no real container, so translation falls back
      // to the raw message key — same fallback as the rest of the HTTP suite.
      expect(errorResponse.message).toBe('errors.notFound')
      expect(status).toBe(404)
      expect(context).toBe(httpCtx)
      expect(errArg).toBe(error)
      expect(await response.text()).toBe('rendered')
    })

    it('first non-undefined callback wins (registration order)', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(() => new Response('first', { status: 500 }))
          this.errorPage(() => new Response('second', { status: 500 }))
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(500), httpCtx)

      expect(await response.text()).toBe('first')
    })

    it('returning undefined defers to the next callback', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(() => undefined)
          this.errorPage(() => new Response('fallback', { status: 500 }))
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(500), httpCtx)

      expect(await response.text()).toBe('fallback')
    })

    it('falls back to the built-in minimal HTML page when all callbacks return undefined', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(() => undefined)
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(500), httpCtx)

      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('#13c397')
    })

    it('supports async callbacks', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(async () => {
            await Promise.resolve()
            return new Response('async-rendered', { status: 404 })
          })
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(404), httpCtx)

      expect(await response.text()).toBe('async-rendered')
    })

    it('does not fire for JSON requests', async () => {
      const spy = vi.fn(() => new Response('html', { status: 500 }))

      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(spy)
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'application/json' }))
      const response = await handler.handle(new HttpException(500), httpCtx)

      expect(spy).not.toHaveBeenCalled()
      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('does not fire for non-HTTP contexts (queue, cron, cli)', async () => {
      const spy = vi.fn(() => new Response('html'))

      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(spy)
        }
      }

      const handler = createHandler(CustomHandler)
      await handler.handle(new TestError(), cliCtx)
      await handler.handle(new TestError(), createQueueExceptionContext('q'))
      await handler.handle(new TestError(), createCronExceptionContext())

      expect(spy).not.toHaveBeenCalled()
    })

    it('subclass overriding renderDefaultHtml replaces the built-in page', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          // no errorPage callbacks → fall through to renderDefaultHtml
        }

        protected renderDefaultHtml(errorResponse: ErrorResponse, status: number): Response {
          return new Response(`<custom>${status}-${errorResponse.message}</custom>`, {
            status,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(404, 'errors.notFound'), httpCtx)

      expect(response.status).toBe(404)
      const html = await response.text()
      expect(html).toBe('<custom>404-errors.notFound</custom>')
    })
  })

  // ── Cause chain logging ─────────────────────────────────────────

  describe('cause chain logging', () => {
    class CausalError extends ApplicationError {
      constructor(messageKey: string, code: number, metadata?: Record<string, unknown>, cause?: unknown) {
        super(messageKey as MessageKeys, code as ErrorCode, metadata, cause)
      }
    }

    it('walks Error.cause and includes it in the logged cause field', async () => {
      const handler = createHandler()
      const inner = Object.assign(new Error('underlying db boom'), {
        code: 2000,
        metadata: { dbErrorCode: '42P01', sql: 'SELECT 1' },
      })
      const outer = new CausalError('errors.databaseGeneric', 2000, { reason: 'wrap' }, inner)

      await handler.handle(outer, cliCtx)

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ApplicationError]',
        expect.objectContaining({
          cause: expect.objectContaining({
            name: 'Error',
            message: 'underlying db boom',
            code: 2000,
            metadata: { dbErrorCode: '42P01', sql: 'SELECT 1' },
          }),
        }),
      )
    })

    it('walks AggregateError.errors[] and surfaces each inner error', async () => {
      const handler = createHandler()
      const a = new Error('a failed')
      const b = new Error('b failed')
      const aggregate = new AggregateError([a, b], '2 failed')
      const outer = new CausalError('errors.cronExecutionFailed', 9204, undefined, aggregate)

      await handler.handle(outer, cliCtx)

      const logData = (mockLogger.error as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>
      const cause = logData.cause as { errors?: { message: string }[] }
      expect(cause.errors).toHaveLength(2)
      expect(cause.errors?.[0]?.message).toBe('a failed')
      expect(cause.errors?.[1]?.message).toBe('b failed')
    })

    it('omits the cause field entirely when neither cause nor AggregateError is present', async () => {
      const handler = createHandler()
      // Use 9000+ code so severity is 'error' and we can inspect mockLogger.error.
      const error = new CausalError('errors.plain', 9999)

      await handler.handle(error, cliCtx)

      const logData = (mockLogger.error as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>
      expect(logData.cause).toBeUndefined()
    })

    it('caps recursion to avoid infinite loops in pathological cause chains', async () => {
      const handler = createHandler()
      // Build a 10-deep chain (deeper than the MAX_CAUSE_DEPTH=5 cap).
      let inner: Error = new Error('depth-0')
      for (let i = 1; i <= 10; i++) {
        inner = Object.assign(new Error(`depth-${i}`), { cause: inner })
      }
      const outer = new CausalError('errors.deep', 9999, undefined, inner)

      await handler.handle(outer, cliCtx)

      const logData = (mockLogger.error as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>
      // Walk the chain and ensure it terminates within reasonable depth.
      let depth = 0
      let node: { cause?: unknown } | undefined = logData.cause as { cause?: unknown }
      while (node && node.cause) {
        depth++
        node = node.cause as { cause?: unknown }
        if (depth > 20) throw new Error('cause walk did not terminate')
      }
      expect(depth).toBeLessThanOrEqual(6)
    })
  })
})
