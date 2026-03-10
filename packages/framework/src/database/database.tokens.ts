export const DATABASE_TOKENS = {
  Options: Symbol.for('stratal:database:options'),
  Services: Symbol.for('stratal:database:services'),
} as const

import type { ConnectionName } from './types'

export function connectionSymbol(name: ConnectionName): symbol {
  return Symbol.for(`stratal:database:connection:${name}`)
}
