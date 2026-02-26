import type { LogEntry } from '../contracts'
import { LogLevel } from '../contracts'
import type { ILogFormatter } from './formatter.interface'

/**
 * Pretty Formatter
 *
 * Human-readable colored output for development environments.
 * Uses ANSI color codes for terminal output.
 *
 * Output format:
 * [2024-01-15 10:30:45] INFO: User logged in
 *   userId: user_456
 */
export class PrettyFormatter implements ILogFormatter {
  private readonly colors: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: '\x1b[36m', // Cyan
    [LogLevel.INFO]: '\x1b[32m', // Green
    [LogLevel.WARN]: '\x1b[33m', // Yellow
    [LogLevel.ERROR]: '\x1b[31m', // Red
  }

  private readonly reset = '\x1b[0m'

  format(entry: LogEntry): string {
    const color = this.colors[entry.level]
    const timestamp = new Date(entry.context.timestamp).toISOString()
    const levelStr = entry.level.toUpperCase().padEnd(5)

    let output = `${color}[${timestamp}] ${levelStr}${this.reset}: ${entry.message}`

    // Add context (exclude timestamp)
    const { timestamp: _, ...contextWithoutTimestamp } = entry.context
    const contextEntries = Object.entries(contextWithoutTimestamp)

    if (contextEntries.length > 0) {
      output += '\n'
      contextEntries.forEach(([key, value]) => {
        output += `  ${key}: ${JSON.stringify(value)}\n`
      })
    }

    // Add error stack if present
    if (entry.error?.stack) {
      output += `\n${entry.error.stack}\n`
    }

    return output.trimEnd()
  }
}
