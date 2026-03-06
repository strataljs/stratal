import { inject } from 'tsyringe'
import { Transient } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import { LOGGER_TOKENS, type LoggerService } from '../logger'
import type {
  EventContext,
  EventHandler,
  EventName,
  EventOptions,
  IEventRegistry,
  RegisteredHandler
} from './types'

@Transient()
export class EventRegistry implements IEventRegistry {
  private handlers = new Map<string, RegisteredHandler[]>()

  constructor(
    @inject(DI_TOKENS.ExecutionContext) private readonly ctx: ExecutionContext,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService
  ) { }

  on<E extends EventName>(event: E, handler: EventHandler<E>, options?: EventOptions): void {
    const registered: RegisteredHandler = {
      handler: handler as EventHandler,
      priority: options?.priority ?? 0,
      blocking: options?.blocking
    }

    const existingHandlers = this.handlers.get(event) ?? []
    existingHandlers.push(registered)
    this.handlers.set(event, existingHandlers)

    this.logger.debug('Event handler registered', {
      event,
      priority: registered.priority,
      blocking: registered.blocking
    })
  }

  async emit<E extends EventName>(
    event: E,
    context?: Partial<EventContext<E>>
  ): Promise<void> {
    // Build full context with caller-provided fields
    const fullContext = {
      ...context
    } as EventContext<E>

    // Find matching handlers using pattern matching
    const matchingHandlers = this.findMatchingHandlers(event)

    if (matchingHandlers.length === 0) {
      return
    }

    // Sort by priority (higher first)
    const sortedHandlers = [...matchingHandlers].sort(
      (a, b) => b.priority - a.priority
    )

    // Determine if we should use waitUntil
    const shouldUseWaitUntil = this.shouldUseWaitUntil(event, sortedHandlers)

    // Execute handlers
    const promises = sortedHandlers.map((registered) =>
      this.executeHandler(registered.handler, fullContext, event)
    )

    if (shouldUseWaitUntil) {
      // Non-blocking: use ctx.waitUntil
      this.ctx.waitUntil(Promise.all(promises))
    } else {
      // Blocking: await all handlers
      await Promise.all(promises)
    }
  }

  off<E extends EventName>(event: E, handler: EventHandler<E>): void {
    const existingHandlers = this.handlers.get(event)
    if (!existingHandlers) return

    const filtered = existingHandlers.filter((h) => h.handler !== handler)
    if (filtered.length > 0) {
      this.handlers.set(event, filtered)
    } else {
      this.handlers.delete(event)
    }

    this.logger.debug('Event handler unregistered', { event })
  }

  once<E extends EventName>(event: E, handler: EventHandler<E>, options?: EventOptions): void {
    const wrappedHandler = (async (context: EventContext<E>) => {
      await handler(context)
      this.off(event, wrappedHandler)
    }) as EventHandler<E>

    this.on(event, wrappedHandler, options)
  }

  /**
   * Find all handlers matching the event using pattern matching.
   * Order: exact match -> model wildcard -> operation wildcard -> global wildcard
   */
  private findMatchingHandlers(event: string): RegisteredHandler[] {
    const handlers: RegisteredHandler[] = []

    const parts = event.split('.')

    if (parts.length === 3) {
      // Database event: "phase.model.operation"
      const [phase, model, operation] = parts

      // 1. Exact match: "after.user.create"
      handlers.push(...(this.handlers.get(event) ?? []))

      // 2. Model wildcard: "after.user"
      handlers.push(...(this.handlers.get(`${phase}.${model}`) ?? []))

      // 3. Operation wildcard: "after.create"
      handlers.push(...(this.handlers.get(`${phase}.${operation}`) ?? []))

      // 4. Global wildcard: "after"
      handlers.push(...(this.handlers.get(phase) ?? []))
    } else if (parts.length === 2) {
      // Could be wildcard like "after.user" or custom event like "auth.verified"
      handlers.push(...(this.handlers.get(event) ?? []))

      if (parts[0] === 'before' || parts[0] === 'after') {
        handlers.push(...(this.handlers.get(parts[0]) ?? []))
      }
    } else {
      handlers.push(...(this.handlers.get(event) ?? []))
    }

    return handlers
  }

  /**
   * Determine if we should use ctx.waitUntil (non-blocking) or await (blocking)
   */
  private shouldUseWaitUntil(
    event: string,
    handlers: RegisteredHandler[]
  ): boolean {
    const hasBlockingHandler = handlers.some((h) => h.blocking === true)
    if (hasBlockingHandler) return false

    const hasNonBlockingHandler = handlers.some((h) => h.blocking === false)
    if (hasNonBlockingHandler) return true

    const phase = event.split('.')[0]
    if (phase === 'before') return false
    if (phase === 'after') return true
    return false // Custom events block by default
  }

  /**
   * Execute a single handler with error isolation
   */
  private async executeHandler<E extends EventName>(
    handler: EventHandler,
    context: EventContext<E>,
    event: string
  ): Promise<void> {
    try {
      await handler(context as EventContext)
    } catch (error) {
      this.logger.error('Event handler error', {
        event,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }
}
