/**
 * Core Event System Types
 *
 * Provides a generic, augmentable event system for Stratal.
 * Core owns the base types; framework's database module augments
 * `CustomEventRegistry` with richly typed database event contexts.
 *
 * ## Custom Events
 *
 * Custom application events can be added via module augmentation:
 *
 * @example
 * ```typescript
 * declare module 'stratal/events' {
 *   interface CustomEventRegistry {
 *     'user.verified': CustomEventContext<{ userId: string; email: string }>
 *     'email.sent': CustomEventContext<{ to: string; subject: string }>
 *   }
 * }
 * ```
 */

// ============================================================================
// Augmentable Registry
// ============================================================================

/**
 * Augmentable event registry.
 * Maps event name -> full context type.
 *
 * Framework's database module augments this with `DatabaseEvents<K>`.
 * Users augment for custom events using `CustomEventContext<TData>`.
 *
 * @example
 * ```typescript
 * declare module 'stratal/events' {
 *   interface CustomEventRegistry {
 *     'user.verified': CustomEventContext<{ userId: string; email: string }>
 *   }
 * }
 * ```
 */
export interface CustomEventRegistry { }

/**
 * All valid event names.
 * Falls back to `string` when no events are registered in CustomEventRegistry.
 */
export type EventName = keyof CustomEventRegistry extends never
  ? string
  : Extract<keyof CustomEventRegistry, string>

// ============================================================================
// Event Context Types
// ============================================================================

/**
 * Helper for user-defined custom events.
 *
 * @example
 * ```typescript
 * declare module 'stratal/events' {
 *   interface CustomEventRegistry {
 *     'user.verified': CustomEventContext<{ userId: string; email: string }>
 *   }
 * }
 * ```
 */
export interface CustomEventContext<TData = unknown> {
  data: TData
  metadata?: Record<string, unknown>
}

/**
 * Event context — looks up the full context type from CustomEventRegistry.
 * For database events, this includes typed data and result from ZenStack schema.
 * Falls back to a generic context shape for unregistered events.
 */
export type EventContext<E extends EventName = EventName> =
  E extends keyof CustomEventRegistry
  ? CustomEventRegistry[E]
  : { data?: unknown; result?: unknown }

// ============================================================================
// Handler & Registry Types
// ============================================================================

/**
 * Options for registering event handlers
 */
export interface EventOptions {
  /** Handler execution priority. Higher values execute first. @default 0 */
  priority?: number
  /**
   * Whether to force blocking (await) vs non-blocking (waitUntil) behavior.
   *
   * Default behavior:
   * - `before.*` events: Always blocking (true)
   * - `after.*` events: Non-blocking via waitUntil (false)
   * - Custom events: Blocking (true)
   */
  blocking?: boolean
}

/**
 * Event handler function signature with typed context
 */
export type EventHandler<E extends EventName = EventName> = (
  context: EventContext<E>
) => Promise<void> | void

/**
 * Internal structure for storing registered handlers
 * @internal
 */
export interface RegisteredHandler {
  handler: EventHandler
  priority: number
  blocking?: boolean
}

/**
 * EventRegistry interface — main API for event system
 */
export interface IEventRegistry {
  on<E extends EventName>(
    event: E,
    handler: EventHandler<E>,
    options?: EventOptions
  ): void

  emit<E extends EventName>(
    event: E,
    context?: Partial<EventContext<E>>
  ): Promise<void>

  off<E extends EventName>(event: E, handler: EventHandler<E>): void

  once<E extends EventName>(
    event: E,
    handler: EventHandler<E>,
    options?: EventOptions
  ): void
}

// ============================================================================
// Decorator Metadata Types
// ============================================================================

/**
 * Metadata stored by `@On()` decorator for each handler method
 */
export interface ListenerHandlerMetadata {
  methodName: string
  event: string
  options?: EventOptions
}
