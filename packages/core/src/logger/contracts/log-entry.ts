import type { LogLevel } from './log-level'
import type { InternalLogContext } from './log-context'

/**
 * Complete log entry structure passed to transports
 * Combines message, level, and enriched context
 */
export interface LogEntry {
  level: LogLevel
  message: string
  context: InternalLogContext
  error?: {
    message: string
    stack?: string
    name?: string
  }
}
