/**
 * Structured metadata attached to log entries
 * Supports arbitrary key-value pairs for context enrichment
 */
export type LogContext = Record<string, unknown>;

/**
 * Internal context automatically added by LoggerService
 * Contains tenant info, request metadata, etc.
 */
export interface InternalLogContext extends LogContext {
  tenantId?: string
  domain?: string
  userId?: string
  timestamp: number
}
