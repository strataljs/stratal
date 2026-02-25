import type { ILogTransport } from './transport.interface'
import type { LogEntry } from '../contracts'

/**
 * Base Transport
 *
 * Abstract base class providing shared transport logic.
 * Reduces code duplication across transport implementations.
 */
export abstract class BaseTransport implements ILogTransport {
  abstract readonly name: string

  /**
   * Write log entry - must be implemented by concrete transports
   */
  abstract write(entry: LogEntry, formatted: string): Promise<void>

  /**
   * Handle transport errors gracefully
   * Logs to console.error as fallback to prevent log loss
   *
   * @param error - Error that occurred during write
   * @param entry - Log entry that failed
   */
  protected handleError(error: unknown, entry: LogEntry): void {
    console.error(`[${this.name}] Failed to write log:`, {
      error: error instanceof Error ? error.message : String(error),
      logMessage: entry.message,
      level: entry.level,
    })
  }
}
