import type { Context } from 'hono'
import { RouterContext } from '../router/router-context'
import type { RouterEnv } from '../router/types'

/**
 * Exception context for errors occurring during HTTP request handling.
 *
 * Provides access to the full {@link RouterContext} for building responses
 * with `ctx.json()`, `ctx.text()`, `ctx.html()`, etc.
 */
export interface HttpExceptionContext {
  readonly type: 'http'
  /** Stratal RouterContext — use for building HTTP responses */
  readonly ctx: RouterContext
}

/**
 * Exception context for errors occurring during queue message processing.
 */
export interface QueueExceptionContext {
  readonly type: 'queue'
  /** Name of the queue being processed */
  readonly queueName: string
}

/**
 * Exception context for errors occurring during scheduled cron execution.
 */
export interface CronExceptionContext {
  readonly type: 'cron'
}

/**
 * Exception context for errors occurring during CLI command execution.
 */
export interface CliExceptionContext {
  readonly type: 'cli'
  /** Name of the command that threw */
  readonly commandName: string
}

/**
 * Discriminated union of all exception context types.
 *
 * Narrow via `ctx.type` to access context-specific properties:
 *
 * @example
 * ```typescript
 * handler.renderable(MyError, (error, ctx) => {
 *   if (ctx.type === 'http') {
 *     return ctx.ctx.json({ message: 'Something went wrong' }, 500)
 *   }
 *   // Non-HTTP contexts: return undefined to use default rendering
 * })
 * ```
 */
export type ExceptionContext =
  | HttpExceptionContext
  | QueueExceptionContext
  | CronExceptionContext
  | CliExceptionContext

/**
 * Create an HTTP exception context from a Hono context.
 *
 * @param c - The raw Hono context from the request
 * @returns An {@link HttpExceptionContext} wrapping a RouterContext
 */
export function createHttpExceptionContext(c: Context<RouterEnv>): HttpExceptionContext {
  return { type: 'http', ctx: new RouterContext(c) }
}

/**
 * Create a queue exception context.
 *
 * @param queueName - The name of the queue being processed
 * @returns A {@link QueueExceptionContext}
 */
export function createQueueExceptionContext(queueName: string): QueueExceptionContext {
  return { type: 'queue', queueName }
}

/**
 * Create a cron exception context.
 *
 * @returns A {@link CronExceptionContext}
 */
export function createCronExceptionContext(): CronExceptionContext {
  return { type: 'cron' }
}

/**
 * Create a CLI command exception context.
 *
 * @param commandName - The name of the command that threw
 * @returns A {@link CliExceptionContext}
 */
export function createCliExceptionContext(commandName: string): CliExceptionContext {
  return { type: 'cli', commandName }
}
