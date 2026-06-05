import { Transient } from '../../di/decorators'
import { defineMetadata, getMetadata } from '../../di/metadata'
import type { Constructor } from '../../types'
import { LISTENER_METADATA_KEYS } from '../constants'

/**
 * Mark a class as an event listener.
 *
 * Applies `@Transient()` for DI and sets metadata so the module system
 * can auto-discover and wire listener handlers at bootstrap time.
 *
 * @example
 * ```typescript
 * @Listener()
 * export class UserCreatedListener {
 *   @On('after.User.create')
 *   async sendWelcomeEmail(context: EventContext<'after.User.create'>) {
 *     // ...
 *   }
 * }
 * ```
 */
export function Listener() {
  return function <T extends Constructor>(target: T) {
    Transient()(target)
    defineMetadata(LISTENER_METADATA_KEYS.IS_LISTENER, true, target)
    return target
  }
}

/**
 * Check if a class is decorated with `@Listener()`
 */
export function isListener(target: Constructor): boolean {
  return getMetadata(LISTENER_METADATA_KEYS.IS_LISTENER, target) === true
}
