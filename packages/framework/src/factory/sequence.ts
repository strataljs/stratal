/**
 * Sequence
 *
 * Auto-incrementing sequence generator for creating unique values.
 *
 * @example Basic usage
 * ```typescript
 * const emailSeq = new Sequence((n) => `user${n}@example.com`)
 *
 * emailSeq.next() // 'user1@example.com'
 * emailSeq.next() // 'user2@example.com'
 * emailSeq.reset()
 * emailSeq.next() // 'user1@example.com'
 * ```
 *
 * @example With factory
 * ```typescript
 * const orderSeq = new Sequence((n) => `ORD-${String(n).padStart(6, '0')}`)
 *
 * export class OrderFactory extends Factory<Order, OrderCreateInput> {
 *   protected definition() {
 *     return {
 *       orderNumber: orderSeq.next(),
 *       // ...
 *     }
 *   }
 * }
 * ```
 */
export class Sequence<T = number> {
  private current = 0

  constructor(private readonly generator?: (n: number) => T) {}

  next(): T {
    this.current++
    if (this.generator) {
      return this.generator(this.current)
    }
    return this.current as T
  }

  peek(): T {
    const value = this.current + 1
    if (this.generator) {
      return this.generator(value)
    }
    return value as T
  }

  reset(): void {
    this.current = 0
  }
}
