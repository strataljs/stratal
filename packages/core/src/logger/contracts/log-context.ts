/**
 * Structured metadata attached to log entries
 * Supports arbitrary key-value pairs for context enrichment
 */
export type LogContext = Record<string, unknown>;

/**
 * Internal context automatically added by LoggerService
 * Contains request metadata, etc.
 */
export interface InternalLogContext extends LogContext {
  userId?: string
  timestamp: number
}
