import type { LogEntry } from '../contracts'

/**
 * Formatter contract
 * Transforms LogEntry into string representation for transport output
 */
export interface ILogFormatter {
  /**
   * Format log entry into string
   * @param entry - Complete log entry with context
   * @returns Formatted string ready for transport
   */
  format(entry: LogEntry): string
}
