import { inject } from 'tsyringe'
import type { ConnectionName } from '../types'
import { connectionSymbol } from '../database.tokens'

export function InjectDB(name: ConnectionName): ParameterDecorator {
  return inject(connectionSymbol(name))
}
