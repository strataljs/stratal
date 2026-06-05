import type { II18nService } from '../i18n/i18n.types';
import type { IQueueProvider } from './providers';
import type { QueueMessage } from './queue-consumer';
import type { DispatchMessage, IQueueSender } from './queue-sender.interface';

/**
 * Queue Sender
 *
 * Implementation of IQueueSender bound to a specific queue binding.
 * Created by QueueRegistry for each registered binding.
 *
 * Automatically enriches messages with:
 * - `id`: UUID generated via crypto.randomUUID()
 * - `metadata.locale`: Current locale from I18n context
 * - `metadata.idempotencyKey`: Deterministic SHA-256 hash of type + payload (if not provided)
 *
 * @example
 * ```typescript
 * // Created by QueueRegistry, not directly instantiated
 * const sender = registry.getQueue('NOTIFICATIONS_QUEUE')
 *
 * await sender.dispatch({
 *   type: 'email.send',
 *   payload: { to: 'user@example.com', subject: 'Hello' }
 * })
 * ```
 */
export class QueueSender implements IQueueSender {
  constructor(
    private readonly binding: string,
    private readonly provider: IQueueProvider,
    private readonly i18n: II18nService
  ) {}

  /**
   * Dispatch a message to this queue.
   *
   * @param message - Message to dispatch (without id)
   */
  async dispatch<T>(message: DispatchMessage<T>): Promise<void> {
    const metadata = { ...message.metadata }

    if (!metadata.locale) {
      const locale = this.i18n.getLocale()
      if (locale) {
        metadata.locale = locale
      }
    }

    metadata.idempotencyKey ??= await this.generateIdempotencyKey(message.type, message.payload);

    // Stamp the producer binding so a failed job can be retried to the right
    // Cloudflare binding. Consumers only see the queue *name*, which is not a
    // valid producer binding key.
    metadata.binding = this.binding

    const fullMessage: QueueMessage<T> = {
      id: crypto.randomUUID(),
      ...message,
      metadata,
    }

    await this.provider.send(this.binding, fullMessage)
  }

  private async generateIdempotencyKey(type: string, payload: unknown): Promise<string> {
    // Use a stable, key-sorted serialization: `JSON.stringify` preserves
    // insertion order, so two semantically identical payloads with differently
    // ordered keys would otherwise hash differently and defeat deduplication.
    const data = new TextEncoder().encode(stableStringify({ type, payload }))
    const hash = await crypto.subtle.digest('SHA-256', data)
    return `queue:${Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')}`
  }
}

/**
 * Deterministic JSON serialization: object keys are emitted in sorted order at
 * every level so the output depends only on the data, not on key insertion
 * order. Arrays keep their order (order is significant). Used to derive a stable
 * idempotency hash from a message's `type` + `payload`.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => {
      const v = (value as Record<string, unknown>)[key]
      if (v === undefined) return undefined
      return `${JSON.stringify(key)}:${stableStringify(v)}`
    })
    .filter((entry): entry is string => entry !== undefined)
  return `{${entries.join(',')}}`
}
