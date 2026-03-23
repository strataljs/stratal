import type { ApplicationError } from './application-error'
import type { ErrorResponse } from './error-response'
import type { ExceptionContext } from './exception-context'

/**
 * Log severity levels for exception reporting.
 */
export type LogSeverity = 'error' | 'warn' | 'info' | 'debug'

/**
 * Callback invoked when a specific exception type is reported.
 *
 * @typeParam T - The exception type this callback handles
 * @param error - The matched exception instance
 * @param context - The execution context where the error occurred
 */
export type ReportableCallback<T extends ApplicationError> =
  (error: T, context: ExceptionContext) => void | Promise<void>

/**
 * Callback invoked to render a specific exception type into a Response.
 *
 * Return `undefined` to fall through to the default renderer.
 *
 * @typeParam T - The exception type this callback handles
 * @param error - The matched exception instance
 * @param context - The execution context where the error occurred
 * @returns A Response, ErrorResponse, or undefined to fall through
 */
export type RenderableCallback<T extends ApplicationError> =
  (error: T, context: ExceptionContext) => Response | ErrorResponse | undefined

/**
 * Callback invoked to post-process every error Response before it is returned.
 *
 * Use this to add headers, change the response body, swap content type, etc.
 *
 * @param response - The rendered Response
 * @param error - The original exception
 * @param context - The execution context where the error occurred
 * @returns The (possibly modified) Response
 */
export type RespondCallback =
  (response: Response, error: ApplicationError, context: ExceptionContext) => Response

/**
 * Callback that returns additional context data to include in all exception logs.
 *
 * @returns Key-value pairs merged into every log entry
 */
export type ContextCallback = () => Record<string, unknown>

/**
 * Handle returned by `reportable()` to control whether default reporting runs.
 */
export interface Reportable {
  /**
   * Prevent the default logger from reporting this exception
   * after the custom reportable callback has run.
   */
  stop(): void
}

/**
 * Constructor type for ApplicationError subclasses.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] required for matching arbitrary constructor signatures
export type ApplicationErrorConstructor<T extends ApplicationError = ApplicationError> = new (...args: any[]) => T
