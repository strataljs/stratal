import type { Constructor } from '../types'
import { COMMAND_METADATA_KEY } from './constants'

/**
 * Check if a class is a Command (has COMMAND_METADATA_KEY metadata).
 *
 * Used by ModuleRegistry for auto-discovery from providers.
 */
export function isCommand(target: Constructor): boolean {
  return Reflect.getMetadata(COMMAND_METADATA_KEY, target) === true
}
