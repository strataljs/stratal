import type { LogEntry } from '../contracts'
import type { ILogFormatter } from './formatter.interface'

/**
 * JSON Formatter
 *
 * Produces structured JSON logs for production environments.
 * Optimized for log aggregation systems (Cloudflare Analytics, Datadog, etc.)
 *
 * Output format:
 * {
 *   "level": "info",
 *   "message": "User logged in",
 *   "timestamp": 1234567890,
 *   "tenantId": "tenant_123",
 *   "userId": "user_456",
 *   "error": { "message": "...", "stack": "..." }
 * }
 */
export class JsonFormatter implements ILogFormatter {
  format(entry: LogEntry): string {
    const output = {
      level: entry.level,
      message: entry.message,
      ...entry.context,
      ...(entry.error && { error: entry.error }),
    }

    return JSON.stringify(output)
  }
}
