import type { LogEntry } from '../contracts'

/**
 * Transport contract
 * Handles delivery of formatted log entries to destinations
 */
export interface ILogTransport {
  /**
   * Transport name for identification
   */
  readonly name: string

  /**
   * Write log entry to destination
   * Must be async to support waitUntil pattern
   *
   * @param entry - Complete log entry
   * @param formatted - Pre-formatted string from formatter
   * @returns Promise that resolves when log is written
   */
  write(entry: LogEntry, formatted: string): Promise<void>
}
