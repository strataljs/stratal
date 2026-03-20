import type { Constructor } from '../types'
import { Seeder } from './seeder'

/**
 * Check if a class is a Seeder (extends Seeder base class).
 *
 * Used by ModuleRegistry for auto-discovery from providers.
 */
export function isSeeder(target: Constructor): boolean {
  return target.prototype instanceof Seeder
}
