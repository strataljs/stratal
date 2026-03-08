export const DATABASE_TOKENS = {
  Options: Symbol.for('DatabaseModuleOptions'),
  Services: Symbol.for('DatabaseServices'),
} as const

import type { ConnectionName } from './types'

export function connectionSymbol(name: ConnectionName): symbol {
  return Symbol.for(`DatabaseConnection:${name}`)
}
