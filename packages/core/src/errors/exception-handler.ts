import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { inject } from 'tsyringe'
import { CONTAINER_TOKEN, type Container } from '../di'
import { Transient } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import { type StratalEnv } from '../env'
import type { StratalExecutionContext } from '../execution-context'
import { I18N_TOKENS } from '../i18n/i18n.tokens'
import type { II18nService, MessageKeys } from '../i18n/i18n.types'
import { LOGGER_TOKENS, type LoggerService } from '../logger'
import type { ApplicationError } from './application-error'
import type { Environment, ErrorResponse } from './error-response'
import type { ExceptionContext, HttpExceptionContext } from './exception-context'
import type {
  ApplicationErrorConstructor,
  ContextCallback,
  LogSeverity,
  RenderableCallback,
  Reportable,
  ReportableCallback,
  RespondCallback,
} from './exception-handler.types'
import { resolveHttpStatus } from './get-http-status'
import { InternalError } from './internal-error'
import { isApplicationError } from './is-application-error'

interface ReportableEntry {
  errorClass: ApplicationErrorConstructor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: ReportableCallback<any>
  shouldStop: boolean
}

interface RenderableEntry {
  errorClass: ApplicationErrorConstructor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: RenderableCallback<any>
}

/**
 * ExceptionHandler — Laravel-inspired exception handling for Stratal.
 *
 * Provides a composable, expressive API for controlling how exceptions are
 * reported (logged / sent to external services) and rendered (turned into
 * HTTP Responses or ErrorResponse objects).
 *
 * **Lifecycle:**
 * 1. The framework resolves this from the DI container (once at init time).
 * 2. `register()` is called to let the user configure reporting / rendering.
 * 3. Module `onException()` hooks contribute additional configuration.
 * 4. On every error, `handle()` runs the pipeline: normalize → report → render → respond.
 *
 * **Usage — extend and override `register()`:**
 *
 * @example
 * ```typescript
 * export class AppExceptionHandler extends ExceptionHandler {
 *   register(): void {
 *     this.reportable(PaymentError, (e, ctx) => {
 *       this.resolve(SentryService).captureException(e)
 *     }).stop()
 *
 *     this.renderable(MaintenanceError, (e, ctx) => {
 *       if (ctx.type === 'http') return ctx.ctx.html('<h1>Maintenance</h1>', 503)
 *     })
 *
 *     this.dontReport([RouteNotFoundError])
 *     this.level(RecordNotFoundError, 'warn')
 *     this.context(() => ({ region: 'us-east-1' }))
 *     this.respond((res, err) => {
 *       res.headers.set('X-Error-Code', String(err.code))
 *       return res
 *     })
 *   }
 * }
 * ```
 */
@Transient()
export abstract class ExceptionHandler {
  private readonly reportables: ReportableEntry[] = []
  private readonly renderables: RenderableEntry[] = []
  private readonly dontReportSet = new Set<ApplicationErrorConstructor>()
  private readonly levelOverrides = new Map<ApplicationErrorConstructor, LogSeverity>()
  private readonly contextCallbacks: ContextCallback[] = []
  private readonly respondCallbacks: RespondCallback[] = []
  private readonly environment: Environment

  constructor(
    @inject(LOGGER_TOKENS.LoggerService) protected readonly logger: LoggerService,
    @inject(DI_TOKENS.CloudflareEnv) protected readonly env: StratalEnv,
    @inject(CONTAINER_TOKEN) private readonly container: Container,
    @inject(DI_TOKENS.ExecutionContext) private readonly executionContext: StratalExecutionContext,
  ) {
    this.environment = this.env.ENVIRONMENT as Environment
  }

  /**
   * Configure exception reporting and rendering.
   *
   * Override this method in your handler class to register custom
   * `reportable()`, `renderable()`, `dontReport()`, `level()`,
   * `context()`, and `respond()` callbacks.
   */
  abstract register(): void

  // ── Public Configuration API ──────────────────────────────────────

  /**
   * Register a custom reporting callback for a specific exception type.
   *
   * The callback is invoked when an error matching `errorClass` (via `instanceof`)
   * is thrown. Chain `.stop()` to prevent the default logger from also reporting.
   *
   * @typeParam T - The exception type to match
   * @param errorClass - Constructor of the exception to match
   * @param callback - Reporting function receiving the typed error and context
   * @returns A {@link Reportable} with a `stop()` method
   *
   * @example
   * ```typescript
   * this.reportable(PaymentError, (e, ctx) => {
   *   sentry.captureException(e)
   * }).stop() // skip default logging
   * ```
   */
  reportable<T extends ApplicationError>(
    errorClass: ApplicationErrorConstructor<T>,
    callback: ReportableCallback<T>,
  ): Reportable {
    const entry: ReportableEntry = { errorClass, callback, shouldStop: false }
    this.reportables.push(entry)
    return {
      stop: () => { entry.shouldStop = true },
    }
  }

  /**
   * Register a custom rendering callback for a specific exception type.
   *
   * The callback should return a `Response` (for HTTP contexts), an `ErrorResponse`,
   * or `undefined` to fall through to the default renderer.
   *
   * @typeParam T - The exception type to match
   * @param errorClass - Constructor of the exception to match
   * @param callback - Rendering function receiving the typed error and context
   *
   * @example
   * ```typescript
   * this.renderable(MaintenanceError, (e, ctx) => {
   *   if (ctx.type === 'http') {
   *     return ctx.ctx.html('<h1>Down for maintenance</h1>', 503)
   *   }
   * })
   * ```
   */
  renderable<T extends ApplicationError>(
    errorClass: ApplicationErrorConstructor<T>,
    callback: RenderableCallback<T>,
  ): void {
    this.renderables.push({ errorClass, callback })
  }

  /**
   * Suppress reporting (logging) for the given exception types.
   *
   * Errors matching these classes will still be rendered into responses
   * but will not be logged or sent to external reporters.
   *
   * @param errorClasses - Array of exception constructors to suppress
   *
   * @example
   * ```typescript
   * this.dontReport([RouteNotFoundError, SchemaValidationError])
   * ```
   */
  dontReport(errorClasses: ApplicationErrorConstructor[]): void {
    for (const cls of errorClasses) {
      this.dontReportSet.add(cls)
    }
  }

  /**
   * Override the log severity for a specific exception type.
   *
   * By default, severity is derived from the error code range.
   * Use this to promote or demote specific errors.
   *
   * @param errorClass - Constructor of the exception to override
   * @param severity - The log severity to use
   *
   * @example
   * ```typescript
   * this.level(RecordNotFoundError, 'warn')
   * ```
   */
  level(errorClass: ApplicationErrorConstructor, severity: LogSeverity): void {
    this.levelOverrides.set(errorClass, severity)
  }

  /**
   * Add global context data to all exception log entries.
   *
   * The callback is invoked on every reported error and its return value
   * is merged into the log data.
   *
   * @param callback - Function returning key-value pairs to include in logs
   *
   * @example
   * ```typescript
   * this.context(() => ({
   *   appVersion: '1.2.3',
   *   region: env.CF_REGION,
   * }))
   * ```
   */
  context(callback: ContextCallback): void {
    this.contextCallbacks.push(callback)
  }

  /**
   * Register a callback to post-process every error Response before it is returned.
   *
   * Use this to add headers, modify the body, change content type, or
   * transform the response in any way.
   *
   * @param callback - Function receiving (response, error, context) and returning a Response
   *
   * @example
   * ```typescript
   * this.respond((response, error, ctx) => {
   *   response.headers.set('X-Error-Code', String(error.code))
   *   return response
   * })
   * ```
   */
  respond(callback: RespondCallback): void {
    this.respondCallbacks.push(callback)
  }

  /**
   * Resolve a service from the DI container.
   *
   * Useful inside `register()` callbacks for accessing injected services
   * (e.g., Sentry, analytics, custom loggers).
   *
   * @typeParam T - The type of the service to resolve
   * @param token - DI token (symbol or constructor)
   * @returns The resolved service instance
   *
   * @example
   * ```typescript
   * this.reportable(CriticalError, (e) => {
   *   this.resolve(SentryService).captureException(e)
   * })
   * ```
   */
  resolve<T>(token: symbol | (new (...args: unknown[]) => T)): T {
    return this.container.resolve<T>(token)
  }

  // ── Pipeline Entry Point ──────────────────────────────────────────

  /**
   * Handle an error through the full exception pipeline.
   *
   * This is the single entry point used by all contexts (HTTP, queue, cron, CLI).
   * It normalizes the error, reports it (non-blocking via `waitUntil`),
   * renders it into a Response, and applies post-processing.
   *
   * @param error - The thrown error (may or may not be an ApplicationError)
   * @param context - The execution context where the error occurred
   * @returns A Response (JSON by default, customizable via renderable/respond)
   */
  async handle(error: unknown, context: ExceptionContext): Promise<Response> {
    const appError = this.normalizeError(error)

    // Report via waitUntil — non-blocking in all CF Workers contexts
    this.executionContext.waitUntil(this.performReport(appError, context))

    // Render into a Response
    const response = await this.performRender(appError, context)

    // Post-process
    return this.applyRespondCallbacks(response, appError, context)
  }

  // ── Internals ─────────────────────────────────────────────────────

  /**
   * Normalize an unknown error into an ApplicationError.
   * Non-ApplicationError values are wrapped in InternalError.
   */
  private normalizeError(error: unknown): ApplicationError {
    if (isApplicationError(error)) {
      return error
    }

    const originalMessage = error instanceof Error ? error.message : String(error)
    const internalError = new InternalError({
      originalError: originalMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // In development, preserve the original error message and stack
    // so the dev error overlay shows what actually went wrong
    if (this.environment === 'development') {
      internalError.message = originalMessage
      if (error instanceof Error && error.stack) {
        internalError.stack = error.stack
      }
    }

    return internalError
  }

  /**
   * Run the reporting pipeline for an error.
   */
  private async performReport(error: ApplicationError, context: ExceptionContext): Promise<void> {
    // 1. Self-report
    if (typeof error.report === 'function') {
      const result = error.report()
      // void (undefined) = skip default; false = also run default
      if (result !== false) return
    }

    // 2. Check dontReport
    if (this.shouldNotReport(error)) return

    // 3. Registered reportable callbacks (most-specific wins)
    const entry = this.findReportable(error)
    if (entry) {
      await entry.callback(error, context)
      if (entry.shouldStop) return
    }

    // 4. Default reporting
    this.defaultReport(error, context)
  }

  /**
   * Run the rendering pipeline for an error, producing a Response.
   */
  private async performRender(error: ApplicationError, context: ExceptionContext): Promise<Response> {
    // 1. Self-render
    if (typeof error.render === 'function') {
      const result = error.render(context)
      if (result !== undefined) {
        return this.toResponse(result, error)
      }
    }

    // 2. Registered renderable callbacks (most-specific wins)
    const entry = this.findRenderable(error)
    if (entry) {
      const result = entry.callback(error, context)
      if (result !== undefined) {
        return this.toResponse(await result, error)
      }
    }

    // 3. Default rendering (content-negotiated)
    return this.defaultRender(error, context)
  }

  /**
   * Apply all respond() callbacks to post-process a Response.
   */
  private applyRespondCallbacks(
    response: Response,
    error: ApplicationError,
    context: ExceptionContext,
  ): Response {
    let result = response
    for (const callback of this.respondCallbacks) {
      result = callback(result, error, context)
    }
    return result
  }

  /**
   * Check if an error is in the dontReport set.
   */
  private shouldNotReport(error: ApplicationError): boolean {
    for (const cls of this.dontReportSet) {
      if (error instanceof cls) return true
    }
    return false
  }

  /**
   * Find the most-specific reportable entry for an error.
   * Walks entries in registration order; picks the most-specific `instanceof` match.
   */
  private findReportable(error: ApplicationError): ReportableEntry | undefined {
    let best: ReportableEntry | undefined
    for (const entry of this.reportables) {
      if (error instanceof entry.errorClass) {
        // More specific class wins (subclass check)
        if (!best || !(error instanceof best.errorClass) || entry.errorClass.prototype instanceof best.errorClass) {
          best = entry
        }
      }
    }
    return best
  }

  /**
   * Find the most-specific renderable entry for an error.
   */
  private findRenderable(error: ApplicationError): RenderableEntry | undefined {
    let best: RenderableEntry | undefined
    for (const entry of this.renderables) {
      if (error instanceof entry.errorClass) {
        if (!best || !(error instanceof best.errorClass) || entry.errorClass.prototype instanceof best.errorClass) {
          best = entry
        }
      }
    }
    return best
  }

  /**
   * Default reporting — log with appropriate severity and i18n translation.
   */
  private defaultReport(error: ApplicationError, context: ExceptionContext): void {
    const translatedMessage = this.translateError(error, context)
    const severity = this.resolveSeverity(error)

    const globalContext = this.gatherContext()

    const logData = {
      code: error.code,
      message: translatedMessage,
      timestamp: error.timestamp,
      metadata: error.metadata,
      name: error.name,
      ...globalContext,
    }

    switch (severity) {
      case 'debug':
        this.logger.debug('[ApplicationError]', logData)
        break
      case 'info':
        this.logger.info('[ApplicationError]', logData)
        break
      case 'warn':
        this.logger.warn('[ApplicationError]', logData)
        break
      case 'error':
        this.logger.error('[ApplicationError]', logData)
        break
    }
  }

  /**
   * Default rendering — content-negotiated.
   *
   * For HTTP requests that accept HTML in development: re-throws the error
   * so the runtime's built-in error UI (e.g., Wrangler) can display it.
   * For HTTP requests that accept HTML in production: renders a minimal branded HTML page.
   * For everything else (API, queue, cron, CLI): returns JSON.
   */
  private defaultRender(error: ApplicationError, context: ExceptionContext): Response {
    const translatedMessage = this.translateError(error, context)
    const errorResponse = error.toErrorResponse(this.environment, translatedMessage)
    const status = resolveHttpStatus(error)

    if (context.type === 'http' && this.wantsHtml(context)) {
      if (this.environment === 'development') {
        error.stack = error.stack?.replace(error.message, translatedMessage)
        error.message = translatedMessage
        throw error
      }
      return this.renderDefaultHtml(errorResponse, status)
    }

    return Response.json(errorResponse, { status })
  }

  // ── Content Negotiation ──────────────────────────────────────────

  /**
   * Check if the HTTP request prefers an HTML response.
   *
   * Uses the `Accept` header to determine format. Inertia v3 XHR requests
   * send `Accept: text/html, application/xhtml+xml`, so they naturally
   * receive HTML error pages (displayed in Inertia's error modal in dev).
   *
   * Override in a subclass to customize content negotiation logic.
   */
  protected wantsHtml(context: HttpExceptionContext): boolean {
    const accept = context.ctx.c.req.header('accept') ?? ''
    return accept.includes('text/html')
  }

  /**
   * Minimal production HTML error page with inline styles.
   */
  private renderDefaultHtml(
    errorResponse: ErrorResponse,
    status: ContentfulStatusCode,
  ): Response {
    const title = this.escapeHtml(errorResponse.message)
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${status} - ${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#334155}.container{text-align:center;padding:2rem}.status{font-size:6rem;font-weight:800;color:#13c397;line-height:1}.message{font-size:1.25rem;color:#64748b;margin-top:1rem}</style>
</head><body><div class="container"><div class="status">${status}</div><div class="message">${title}</div></div></body></html>`
    return new Response(html, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /**
   * Convert a render result (Response or ErrorResponse) into a Response.
   */
  private toResponse(result: Response | ErrorResponse, error: ApplicationError): Response {
    if (result instanceof Response) return result
    const status = resolveHttpStatus(error)
    return Response.json(result, { status })
  }

  /**
   * Translate an error's message key via i18n.
   * Uses the request container (from HTTP context) for correct locale,
   * falling back to the global container or raw message string.
   */
  private translateError(error: ApplicationError, context: ExceptionContext): string {
    try {
      const resolveContainer = context.type === 'http'
        ? context.ctx.getContainer()
        : this.container
      const i18n = resolveContainer.resolve<II18nService>(I18N_TOKENS.I18nService)
      const params = error.metadata as Record<string, string | number> | undefined
      return i18n.t(error.message as MessageKeys, params)
    } catch {
      // I18n unavailable (startup/RPC context) — return raw message key
      return error.message
    }
  }

  /**
   * Resolve the log severity for an error.
   * Checks level overrides first, then falls back to code-range-based severity.
   */
  private resolveSeverity(error: ApplicationError): LogSeverity {
    // Check registered overrides (most-specific class wins)
    let bestClass: ApplicationErrorConstructor | undefined
    let bestSeverity: LogSeverity | undefined

    for (const [cls, severity] of this.levelOverrides) {
      if (error instanceof cls) {
        if (!bestClass || cls.prototype instanceof bestClass) {
          bestClass = cls
          bestSeverity = severity
        }
      }
    }

    return bestSeverity ?? this.getDefaultSeverity(error.code)
  }

  /**
   * Determine default log severity based on error code range.
   */
  private getDefaultSeverity(code: number): LogSeverity {
    if (code >= 9000) return 'error'
    if (code >= 2000 && code < 3000) return 'error'
    if (code >= 5000 && code < 6000) return 'warn'
    if (code >= 1000 && code < 2000) return 'info'
    if (code >= 3000 && code < 5000) return 'warn'
    return 'error'
  }

  /**
   * Gather all global context data from registered callbacks.
   */
  private gatherContext(): Record<string, unknown> {
    if (this.contextCallbacks.length === 0) return {}
    const merged: Record<string, unknown> = {}
    for (const callback of this.contextCallbacks) {
      Object.assign(merged, callback())
    }
    return merged
  }
}
