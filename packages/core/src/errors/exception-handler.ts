import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { inject } from '../di';
import { CONTAINER_TOKEN, type Container } from '../di';
import { Transient } from '../di/decorators';
import { DI_TOKENS } from '../di/tokens';
import { type StratalEnv } from '../env';
import type { StratalExecutionContext } from '../execution-context';
import { LOGGER_TOKENS, type LoggerService } from '../logger';
import type { ApplicationError } from './application-error';
import type { Environment, ErrorResponse } from './error-response';
import type { ExceptionContext, HttpExceptionContext } from './exception-context';
import type {
    ApplicationErrorConstructor,
    ContextCallback,
    ErrorPageCallback,
    LogSeverity,
    RenderableCallback,
    Reportable,
    ReportableCallback,
    RespondCallback,
} from './exception-handler.types';
import { HTTP_STATUS_MESSAGES, HttpException } from './http-exception';
import { InternalError } from './internal-error';
import { isApplicationError } from './is-application-error';

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

@Transient()
export abstract class ExceptionHandler {
  private readonly reportables: ReportableEntry[] = []
  private readonly renderables: RenderableEntry[] = []
  private readonly dontReportSet = new Set<ApplicationErrorConstructor>()
  private readonly levelOverrides = new Map<ApplicationErrorConstructor, LogSeverity>()
  private readonly contextCallbacks: ContextCallback[] = []
  private readonly respondCallbacks: RespondCallback[] = []
  private readonly errorPages: ErrorPageCallback[] = []
  private readonly environment: Environment

  constructor(
    @inject(LOGGER_TOKENS.LoggerService) protected readonly logger: LoggerService,
    @inject(DI_TOKENS.CloudflareEnv) protected readonly env: StratalEnv,
    @inject(CONTAINER_TOKEN) private readonly container: Container,
    @inject(DI_TOKENS.ExecutionContext) private readonly executionContext: StratalExecutionContext,
  ) {
    this.environment = this.env.ENVIRONMENT as Environment
  }

  abstract register(): void

  // ── Public Configuration API ──────────────────────────────────────

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

  renderable<T extends ApplicationError>(
    errorClass: ApplicationErrorConstructor<T>,
    callback: RenderableCallback<T>,
  ): void {
    this.renderables.push({ errorClass, callback })
  }

  dontReport(errorClasses: ApplicationErrorConstructor[]): void {
    for (const cls of errorClasses) {
      this.dontReportSet.add(cls)
    }
  }

  level(errorClass: ApplicationErrorConstructor, severity: LogSeverity): void {
    this.levelOverrides.set(errorClass, severity)
  }

  context(callback: ContextCallback): void {
    this.contextCallbacks.push(callback)
  }

  respond(callback: RespondCallback): void {
    this.respondCallbacks.push(callback)
  }

  errorPage(callback: ErrorPageCallback): void {
    this.errorPages.push(callback)
  }

  resolve<T>(token: symbol | (new (...args: unknown[]) => T)): T {
    return this.container.resolve<T>(token)
  }

  // ── Pipeline Entry Point ──────────────────────────────────────────

  async handle(error: unknown, context: ExceptionContext): Promise<Response> {
    const appError = this.normalizeError(error)

    this.executionContext.waitUntil(this.performReport(appError, context))

    const response = await this.performRender(appError, context)

    return this.applyRespondCallbacks(response, appError, context)
  }

  // ── Internals ─────────────────────────────────────────────────────

  private normalizeError(error: unknown): ApplicationError {
    if (isApplicationError(error)) {
      return error
    }

    return new InternalError(error)
  }

  private async performReport(error: ApplicationError, context: ExceptionContext): Promise<void> {
    if (this.shouldNotReport(error)) return

    const entry = this.findReportable(error)
    if (entry) {
      await entry.callback(error, context)
      if (entry.shouldStop) return
    }

    this.defaultReport(error)
  }

  private async performRender(error: ApplicationError, context: ExceptionContext): Promise<Response> {
    const entry = this.findRenderable(error)
    if (entry) {
      const result = entry.callback(error, context)
      if (result !== undefined) {
        return this.toResponse(await result, error)
      }
    }

    return await this.defaultRender(error, context)
  }

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

  private shouldNotReport(error: ApplicationError): boolean {
    for (const cls of this.dontReportSet) {
      if (error instanceof cls) return true
    }
    return false
  }

  private findReportable(error: ApplicationError): ReportableEntry | undefined {
    let best: ReportableEntry | undefined
    for (const entry of this.reportables) {
      if (this.matchesErrorClass(error, entry.errorClass)) {
        if (!best || !this.matchesErrorClass(error, best.errorClass) || entry.errorClass.prototype instanceof best.errorClass) {
          best = entry
        }
      }
    }
    return best
  }

  private findRenderable(error: ApplicationError): RenderableEntry | undefined {
    let best: RenderableEntry | undefined
    for (const entry of this.renderables) {
      if (this.matchesErrorClass(error, entry.errorClass)) {
        if (!best || !this.matchesErrorClass(error, best.errorClass) || entry.errorClass.prototype instanceof best.errorClass) {
          best = entry
        }
      }
    }
    return best
  }

  private matchesErrorClass(error: ApplicationError, cls: ApplicationErrorConstructor): boolean {
    if (error instanceof cls) return true
    return (error as Error).constructor.name === cls.name
  }

  private defaultReport(error: ApplicationError): void {
    const severity = this.resolveSeverity(error)
    const globalContext = this.gatherContext()

    const logData: Record<string, unknown> = {
      ...error.reportContext(),
      message: error.message,
      timestamp: error.timestamp,
      name: error.name,
      stack: error.stack,
      ...globalContext,
    }

    const chain = serializeErrorChain(error)
    if (chain) {
      logData.cause = chain
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

  private async defaultRender(error: ApplicationError, context: ExceptionContext): Promise<Response> {
    const status = this.resolveStatus(error)
    const errorResponse = this.buildErrorResponse(error, status)

    if (context.type === 'http' && this.wantsHtml(context)) {
      for (const callback of this.errorPages) {
        try {
          const result = await callback(errorResponse, status, context, error)
          if (result !== undefined) return result
        } catch (callbackError) {
          this.logger.warn('errorPage callback failed, falling back to next handler', {
            error: callbackError instanceof Error ? callbackError.message : String(callbackError),
          })
        }
      }
      return this.renderDefaultHtml(errorResponse, status)
    }

    return Response.json(errorResponse, { status })
  }

  // ── Content Negotiation ──────────────────────────────────────────

  protected wantsHtml(context: HttpExceptionContext): boolean {
    const accept = context.ctx.c.req.header('accept') ?? ''
    return accept.includes('text/html')
  }

  protected renderDefaultHtml(
    errorResponse: ErrorResponse,
    status: ContentfulStatusCode,
  ): Response {
    const title = this.escapeHtml(errorResponse.message)
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${status} - ${title}</title>
<link rel="icon" type="image/x-icon" href="/favicon.svg">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#334155}.container{text-align:center;padding:2rem}.status{font-size:6rem;font-weight:800;color:#13c397;line-height:1}.message{font-size:1.25rem;color:#64748b;margin-top:1rem}</style>
</head><body><div class="container"><div class="status">${status}</div><div class="message">${title}</div></div></body></html>`
    return new Response(html, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  private resolveStatus(error: ApplicationError): ContentfulStatusCode {
    if (error instanceof HttpException) return error.httpStatus
    const httpStatus = (error as { httpStatus?: number }).httpStatus
    if (typeof httpStatus === 'number') return httpStatus as ContentfulStatusCode
    return 500
  }

  private buildErrorResponse(error: ApplicationError, status: ContentfulStatusCode): ErrorResponse {
    const isServerError = status >= 500
    const isDev = this.environment === 'development'
    const message = isServerError && !isDev
      ? (HTTP_STATUS_MESSAGES[status] ?? 'Internal Server Error')
      : error.message

    return {
      message,
      timestamp: error.timestamp,
      stack: isDev ? error.stack : undefined,
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  private toResponse(result: Response | ErrorResponse, error: ApplicationError): Response {
    if (result instanceof Response) return result
    const status = this.resolveStatus(error)
    return Response.json(result, { status })
  }

  private resolveSeverity(error: ApplicationError): LogSeverity {
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

    if (bestSeverity) return bestSeverity

    const status = this.resolveStatus(error)
    return this.getDefaultSeverity(status)
  }

  private getDefaultSeverity(status: number): LogSeverity {
    if (status >= 500) return 'error'
    if (status >= 400) return 'warn'
    return 'error'
  }

  private gatherContext(): Record<string, unknown> {
    if (this.contextCallbacks.length === 0) return {}
    const merged: Record<string, unknown> = {}
    for (const callback of this.contextCallbacks) {
      Object.assign(merged, callback())
    }
    return merged
  }
}

interface SerializedErrorNode {
  name: string
  message: string
  stack?: string
  cause?: SerializedErrorNode | { value: unknown }
  errors?: SerializedErrorNode[]
}

const MAX_CAUSE_DEPTH = 5

function serializeErrorChain(error: Error): SerializedErrorNode | undefined {
  const cause = (error as { cause?: unknown }).cause
  const aggregated = error instanceof AggregateError && Array.isArray(error.errors) && error.errors.length > 0
  if (cause === undefined && !aggregated) {
    return undefined
  }
  if (cause !== undefined) {
    return cause instanceof Error
      ? serializeErrorNode(cause, 0)
      : ({ value: cause } as unknown as SerializedErrorNode)
  }
  return {
    name: error.name,
    message: error.message,
    errors: (error as AggregateError).errors.map((inner) =>
      inner instanceof Error
        ? serializeErrorNode(inner, 0)
        : { name: 'Unknown', message: String(inner) },
    ),
  }
}

function serializeErrorNode(error: Error, depth: number): SerializedErrorNode {
  const out: SerializedErrorNode = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }

  if (depth >= MAX_CAUSE_DEPTH) return out

  if (error instanceof AggregateError && Array.isArray(error.errors) && error.errors.length > 0) {
    out.errors = error.errors.map((inner) =>
      inner instanceof Error
        ? serializeErrorNode(inner, depth + 1)
        : { name: 'Unknown', message: String(inner) },
    )
  }

  const cause = (error as { cause?: unknown }).cause
  if (cause !== undefined) {
    out.cause = cause instanceof Error
      ? serializeErrorNode(cause, depth + 1)
      : { value: cause }
  }

  return out
}
