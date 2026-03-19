import { Command } from './command'
import type { Constructor } from '../types'

/**
 * Check if a class is a Command (extends Command base class).
 *
 * Used by ModuleRegistry for auto-discovery from providers.
 */
export function isCommand(target: Constructor): boolean {
  return target.prototype instanceof Command
}
