import { Transient } from '../../di/decorators'
import { type Constructor } from '../../types'
import { ROUTE_METADATA_KEYS } from '../constants'
import type { ControllerOptions } from '../types'

const CONTROLLER_ROUTE_KEY = ROUTE_METADATA_KEYS.CONTROLLER_ROUTE

/**
 * Base controller decorator for route registration
 *
 * This is the core controller decorator that handles:
 * - Transient scope registration (request-scoped)
 * - Route metadata storage
 * - Controller options (tags, security schemes, hideFromDocs)
 *
 * @param route - Base route for this controller (e.g., '/api/v1/users')
 * @param options - Optional configuration (tags, security schemes, hideFromDocs)
 *
 * @example
 * ```typescript
 * import { Controller } from 'stratal/router'
 *
 * @Controller('/api/v1/users', { tags: ['Users'] })
 * export class UsersController implements IController {
 *   // All routes accessible
 * }
 * ```
 */
export function Controller(route: string, options?: ControllerOptions) {
  return function <T extends Constructor>(target: T) {
    // Wrap @Transient (handles @injectable and scope metadata)
    Transient()(target)

    // Store route metadata on the class
    Reflect.defineMetadata(CONTROLLER_ROUTE_KEY, route, target)

    // Store options metadata if provided
    if (options) {
      Reflect.defineMetadata(ROUTE_METADATA_KEYS.CONTROLLER_OPTIONS, options, target)
    }

    return target
  }
}

/**
 * Get the route from controller class metadata
 *
 * @param target - Controller class or instance
 * @returns Route string or undefined if not set
 */
export function getControllerRoute(target: object): string | undefined {
  // Check if target is a class constructor (function) or an instance
  // If class, get metadata from it directly; if instance, get from constructor
  const metadataTarget = typeof target === 'function' ? target : (target as { constructor: object }).constructor
  return Reflect.getMetadata(CONTROLLER_ROUTE_KEY, metadataTarget) as string | undefined
}

/**
 * Get the options from controller class metadata
 *
 * @param target - Controller class or instance
 * @returns Controller options or undefined if not set
 */
export function getControllerOptions(target: object): ControllerOptions | undefined {
  const metadataTarget = typeof target === 'function' ? target : (target as { constructor: object }).constructor
  return Reflect.getMetadata(ROUTE_METADATA_KEYS.CONTROLLER_OPTIONS, metadataTarget) as ControllerOptions | undefined
}
