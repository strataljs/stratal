import type { ParsedSignature } from './types'

/**
 * Generate formatted help/usage text from a parsed signature.
 *
 * Pure function, edge-compatible.
 */
export function generateUsage(signature: ParsedSignature, description?: string): string {
  const lines: string[] = []

  // Usage line
  lines.push(`Usage: quarry ${buildUsageLine(signature)}`)

  // Description
  if (description) {
    lines.push('')
    lines.push(description)
  }

  // Arguments section
  if (signature.arguments.length > 0) {
    lines.push('')
    lines.push('Arguments:')
    const argRows = signature.arguments.map((arg) => {
      const label = arg.name
      const parts: string[] = []

      if (arg.description) parts.push(arg.description)

      if (arg.isArray) {
        parts.push('(variadic)')
      } else if (arg.required) {
        parts.push('(required)')
      } else if (arg.default !== undefined) {
        parts.push(`(default: ${arg.default})`)
      } else {
        parts.push('(optional)')
      }

      return [label, parts.join(' ')] as const
    })
    lines.push(...formatTable(argRows))
  }

  // Options section
  if (signature.options.length > 0) {
    lines.push('')
    lines.push('Options:')
    const optRows = signature.options.map((opt) => {
      const flagParts: string[] = []
      if (opt.alias) flagParts.push(`-${opt.alias},`)
      flagParts.push(`--${opt.name}`)

      const label = flagParts.join(' ')
      const parts: string[] = []

      if (opt.description) parts.push(opt.description)
      if (!opt.isFlag && !opt.description) parts.push('Accepts a value')
      if (opt.isFlag && !opt.description) parts.push('Boolean flag')
      if (opt.isArray) parts.push('(multiple)')
      if (opt.default !== undefined) parts.push(`(default: ${opt.default})`)

      return [label, parts.join(' ')] as const
    })
    lines.push(...formatTable(optRows))
  }

  return lines.join('\n')
}

function buildUsageLine(signature: ParsedSignature): string {
  const parts = [signature.name]

  for (const arg of signature.arguments) {
    if (arg.isArray) {
      parts.push(`<${arg.name}...>`)
    } else if (arg.required) {
      parts.push(`<${arg.name}>`)
    } else {
      parts.push(`[${arg.name}]`)
    }
  }

  for (const opt of signature.options) {
    const flagStr = opt.alias ? `-${opt.alias},--${opt.name}` : `--${opt.name}`

    if (opt.isFlag) {
      parts.push(`[${flagStr}]`)
    } else if (opt.isArray) {
      parts.push(`[${flagStr} <value...>]`)
    } else {
      parts.push(`[${flagStr} <value>]`)
    }
  }

  return parts.join(' ')
}

function formatTable(rows: readonly (readonly [string, string])[]): string[] {
  if (rows.length === 0) return []

  const maxLabel = Math.max(...rows.map(([label]) => label.length))
  const padding = 4

  return rows.map(([label, desc]) => {
    return `  ${label.padEnd(maxLabel + padding)}${desc}`
  })
}
