import 'reflect-metadata'

import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from '../../di/container'
import { DI_TOKENS } from '../../di/tokens'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { LOGGER_TOKENS } from '../../logger'
import { ApplicationError } from '../application-error'
import { DefaultExceptionHandler } from '../default-exception-handler'
import type { ErrorResponse } from '../error-response'
import type { ExceptionContext } from '../exception-context'
import { createCliExceptionContext, createCronExceptionContext, createHttpExceptionContext, createQueueExceptionContext } from '../exception-context'
import { ExceptionHandler } from '../exception-handler'
import { HttpException } from '../http-exception'
import { InternalError } from '../internal-error'

// ── Test Fixtures ───────────────────────────────────────────────────

class TestError extends ApplicationError {
  constructor(message = 'Test error occurred') {
    super(message)
  }
}

class ChildTestError extends TestError {
  constructor() {
    super('Child error occurred')
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
      expect(body.message).toBeDefined()
    })

    it('should render ApplicationError as JSON', async () => {
      const handler = createHandler()
      const error = new TestError()
      const response = await handler.handle(error, cliCtx)

      const body: Record<string, unknown> = await response.json()
      expect(body.message).toBeDefined()
    })

    it('should use HttpException httpStatus for status code', async () => {
      const handler = createHandler()
      const error = new HttpException(418 as never, 'Teapot')
      const response = await handler.handle(error, cliCtx)

      expect(response.status).toBe(418)
    })

    it('should default to 500 status for non-HttpException errors', async () => {
      const handler = createHandler()
      const error = new TestError('some error')
      const response = await handler.handle(error, cliCtx)

      expect(response.status).toBe(500)
    })

    it('should report via waitUntil', async () => {
      const handler = createHandler()
      await handler.handle(new TestError(), cliCtx)

      expect(mockWaitUntil).toHaveBeenCalledOnce()
    })

    it('should log with correct severity for 4xx errors (warn)', async () => {
      const handler = createHandler()
      await handler.handle(new HttpException(400, 'Bad request'), cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(mockLogger.warn).toHaveBeenCalled()
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
      expect(mockLogger.error).toHaveBeenCalled()
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

      expect(body.message).toBeDefined()
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

      expect(body.message).toBeDefined()
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
      const logCall = mockLogger.error.mock.calls[0]
      expect(logCall[1]).toMatchObject({ appVersion: '1.0.0' })
    })
  })

  // ── respond() ─────────────────────────────────────────────────

  describe('respond', () => {
    it('should post-process the response', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.respond((response, error) => {
            response.headers.set('X-Error-Name', error.name)
            return response
          })
        }
      }

      const handler = createHandler(CustomHandler)
      const response = await handler.handle(new TestError(), cliCtx)

      expect(response.headers.get('X-Error-Name')).toBe('TestError')
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

  // ── Context types ─────────────────────────────────────────────

  describe('context types', () => {
    it('should handle errors in queue context', async () => {
      const handler = createHandler()
      const queueCtx = createQueueExceptionContext('my-queue')
      const response = await handler.handle(new HttpException(400, 'Bad request'), queueCtx)

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
      const response = await handler.handle(new HttpException(400, 'Bad request'), cliCtx)

      expect(response.status).toBe(400)
    })
  })

  // ── Localization via renderable() ───────────────────────────────

  describe('localization', () => {
    it('consumer exception handler can translate error messages via renderable()', async () => {
      const translations: Record<string, Record<string, string>> = {
        en: { 'Not Found': 'Not Found' },
        fr: { 'Not Found': 'Introuvable' },
      }

      class LocalizedHandler extends ExceptionHandler {
        register(): void {
          this.renderable(HttpException, (error) => {
            const locale = 'fr'
            const translated = translations[locale]?.[error.message] ?? error.message
            return Response.json(
              { message: translated, timestamp: error.timestamp },
              { status: error.httpStatus },
            )
          })
        }
      }

      const handler = createHandler(LocalizedHandler)
      const response = await handler.handle(new HttpException(404, 'Not Found'), cliCtx)
      const body = await response.json() as { message: string }

      expect(response.status).toBe(404)
      expect(body.message).toBe('Introuvable')
    })

    it('falls back to plain English message by default', async () => {
      const handler = createHandler()
      const response = await handler.handle(new HttpException(404, 'Not Found'), cliCtx)
      const body = await response.json() as { message: string }

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
      expect(body.message).toBeDefined()
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
      // Plain errors are normalized to InternalError with "Internal Server Error" message;
      // in dev mode the raw message is shown in the HTML page.
      expect(html).toContain('Internal Server Error')
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
    it('receives errorResponse, status, context, and error', async () => {
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
      const error = new HttpException(404, 'Not Found')

      const response = await handler.handle(error, httpCtx)

      expect(spy).toHaveBeenCalledOnce()
      const [errorResponse, status, context, errArg] = spy.mock.calls[0]
      expect(errorResponse.message).toBe('Not Found')
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

    it('falls back to renderDefaultHtml when an errorPage callback throws', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(() => { throw new Error('Page not found: Errors/500') })
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(500), httpCtx)

      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'errorPage callback failed, falling back to next handler',
        { error: 'Page not found: Errors/500' },
      )
    })

    it('skips a throwing callback and uses the next successful one', async () => {
      class CustomHandler extends ExceptionHandler {
        register(): void {
          this.errorPage(() => { throw new Error('missing page') })
          this.errorPage(() => new Response('fallback-page', { status: 500 }))
        }
      }

      const handler = createHandler(CustomHandler)
      const httpCtx = createHttpExceptionContext(createMockHonoCtx({ accept: 'text/html' }))
      const response = await handler.handle(new HttpException(500), httpCtx)

      expect(await response.text()).toBe('fallback-page')
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
      const response = await handler.handle(new HttpException(404, 'Not Found'), httpCtx)

      expect(response.status).toBe(404)
      const html = await response.text()
      expect(html).toBe('<custom>404-Not Found</custom>')
    })
  })

  // ── Cause chain logging ─────────────────────────────────────────

  describe('cause chain logging', () => {
    it('walks Error.cause and includes it in the logged cause field', async () => {
      const handler = createHandler()
      const inner = new Error('underlying db boom')
      const outer = new ApplicationError('Database error', inner)

      await handler.handle(outer, cliCtx)

      await mockWaitUntil.mock.calls[0][0]
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ApplicationError]',
        expect.objectContaining({
          cause: expect.objectContaining({
            name: 'Error',
            message: 'underlying db boom',
          }),
        }),
      )
    })

    it('walks AggregateError.errors[] and surfaces each inner error', async () => {
      const handler = createHandler()
      const a = new Error('a failed')
      const b = new Error('b failed')
      const aggregate = new AggregateError([a, b], '2 failed')
      const outer = new ApplicationError('Multiple failures', aggregate)

      await handler.handle(outer, cliCtx)

      const logData = (mockLogger.error as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>
      const cause = logData.cause as { errors?: { message: string }[] }
      expect(cause.errors).toHaveLength(2)
      expect(cause.errors?.[0]?.message).toBe('a failed')
      expect(cause.errors?.[1]?.message).toBe('b failed')
    })

    it('omits the cause field entirely when neither cause nor AggregateError is present', async () => {
      const handler = createHandler()
      const error = new ApplicationError('plain error')

      await handler.handle(error, cliCtx)

      await mockWaitUntil.mock.calls[0][0]
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
      const outer = new ApplicationError('deep error', inner)

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
