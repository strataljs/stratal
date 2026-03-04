import { LISTENER_METADATA_KEYS } from '../constants'
import type { EventName, EventOptions, ListenerHandlerMetadata } from '../types'

/**
 * Register a method as an event handler within a `@Listener()` class.
 *
 * Accumulates handler metadata on the class so the framework can
 * auto-wire handlers with the EventRegistry at bootstrap time.
 *
 * @param event - Event name to listen for (fully typed with autocomplete)
 * @param options - Optional handler options (priority, blocking)
 *
 * @example
 * ```typescript
 * @Listener()
 * export class AuditListener {
 *   @On('after.User.create')
 *   async logCreate(context: EventContext<'after.User.create'>) { ... }
 *
 *   @On('after.User.delete', { priority: 10 })
 *   async logDelete(context: EventContext<'after.User.delete'>) { ... }
 * }
 * ```
 */
export function On<E extends EventName>(event: E, options?: EventOptions) {
  return function (
    target: object,
    propertyKey: string,
    _descriptor: PropertyDescriptor
  ) {
    const existingHandlers: ListenerHandlerMetadata[] =
      (Reflect.getMetadata(LISTENER_METADATA_KEYS.EVENT_HANDLERS, target.constructor) as ListenerHandlerMetadata[] | undefined) ?? []

    existingHandlers.push({
      methodName: propertyKey,
      event: event as string,
      options,
    })

    Reflect.defineMetadata(
      LISTENER_METADATA_KEYS.EVENT_HANDLERS,
      existingHandlers,
      target.constructor
    )
  }
}

/**
 * Get all `@On()` handler metadata from a listener class
 */
export function getListenerHandlers(target: object): ListenerHandlerMetadata[] {
  const metadataTarget = typeof target === 'function' ? target : target.constructor
  return (Reflect.getMetadata(LISTENER_METADATA_KEYS.EVENT_HANDLERS, metadataTarget) as ListenerHandlerMetadata[] | undefined) ?? []
}
