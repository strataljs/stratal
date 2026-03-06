export const DATABASE_TOKENS = {
  Options: Symbol.for('DatabaseModuleOptions'),
  Services: Symbol.for('DatabaseServices'),
} as const

export function connectionSymbol(name: string): symbol {
  return Symbol.for(`DatabaseConnection:${name}`)
}
