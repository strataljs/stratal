import { bold, cyan, dim, dimWhite, yellow } from './colors'
import type { ParsedSignature } from './types'

/**
 * Generate formatted help/usage text from a parsed signature.
 *
 * Pure function, edge-compatible.
 */
export function generateUsage(signature: ParsedSignature, description?: string): string {
  const lines: string[] = []

  // Usage line
  lines.push(`${bold('Usage:')} ${bold(cyan('quarry ' + buildUsageLine(signature)))}`)

  // Description
  if (description) {
    lines.push('')
    lines.push(description)
  }

  // Arguments section
  if (signature.arguments.length > 0) {
    lines.push('')
    lines.push(bold(yellow('Arguments:')))
    const argRows = signature.arguments.map((arg) => {
      const label = arg.name
      const parts: string[] = []

      if (arg.description) parts.push(arg.description)

      if (arg.isArray) {
        parts.push('(variadic)')
      } else if (arg.required) {
        parts.push('(required)')
      } else if (arg.default !== undefined) {
        parts.push(dim(`(default: ${arg.default})`))
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
    lines.push(bold(yellow('Options:')))
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
      if (opt.default !== undefined) parts.push(dim(`(default: ${opt.default})`))

      return [label, parts.join(' ')] as const
    })
    lines.push(...formatTable(optRows))
  }

  return lines.join('\n')
}

export interface ListingOptions {
  binaryName?: string
  binaryLabel?: string
  binaryVersion?: string
}

/**
 * Generate a compact command listing with visual hierarchy.
 */
export function generateListing(
  commands: { name: string; description?: string; aliases: string[] }[],
  signatures: Map<string, ParsedSignature>,
  options?: ListingOptions,
): string {
  const bin = options?.binaryName ?? 'quarry'
  const label = options?.binaryLabel ?? 'Quarry CLI'
  const version = options?.binaryVersion

  const lines: string[] = []

  // Header
  lines.push(bold(`${label}${version ? ` v${version}` : ''}`))
  lines.push('')

  // Usage
  lines.push(bold(yellow('Usage')))
  lines.push(`  $ ${bin} <command> [options]`)
  lines.push('')

  // Commands
  if (commands.length === 0) {
    lines.push('No registered commands.')
    return lines.join('\n')
  }

  lines.push(bold(yellow('Commands')))

  const termWidth = typeof process !== 'undefined'
    ? (process.stdout.columns as number | undefined) ?? 80
    : 80

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const sig = signatures.get(cmd.name)
    const sigParts: string[] = [cyan(cmd.name)]

    if (cmd.aliases.length > 0) {
      sigParts.push(cyan(`(alias: ${cmd.aliases.join(', ')})`))
    }

    if (sig) {
      const inlineParts: string[] = []
      for (const arg of sig.arguments) {
        inlineParts.push(formatArgPlaceholder(arg))
      }

      for (const opt of sig.options) {
        const flagStr = opt.alias ? `-${opt.alias},--${opt.name}` : `--${opt.name}`
        inlineParts.push(`[${flagStr}]`)
      }

      if (inlineParts.length > 0) {
        sigParts.push(dim(inlineParts.join(' ')))
      }
    }

    const sigLine = '  ' + sigParts.join(' ')
    lines.push(...wrapLine(sigLine, termWidth, '      '))

    if (cmd.description) {
      lines.push(`    ${dimWhite(cmd.description)}`)
    }

    if (i < commands.length - 1) {
      lines.push('')
    }
  }

  lines.push('')

  // Footer
  lines.push(dimWhite(`Run ${bin} help <command> for detailed information.`))

  return lines.join('\n')
}

/** Format a single argument into its placeholder representation (e.g. `<name>`, `[name=default]`). */
function formatArgPlaceholder(arg: ParsedSignature['arguments'][number]): string {
  if (arg.isArray) return `<${arg.name}...>`
  if (arg.required) return `<${arg.name}>`
  if (arg.default !== undefined) return `[${arg.name}=${arg.default}]`
  return `[${arg.name}]`
}

/** Build the inline usage line showing the command name with argument and option placeholders. */
function buildUsageLine(signature: ParsedSignature): string {
  const parts = [signature.name]

  for (const arg of signature.arguments) {
    parts.push(formatArgPlaceholder(arg))
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

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g

/** Remove ANSI escape sequences from a string. */
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

// eslint-disable-next-line no-control-regex
const TOKEN_RE = /(?:\x1b\[[0-9;]*m)*[^\s\x1b]+(?:\x1b\[[0-9;]*m)*/g

/** Wrap a single line at word boundaries, preserving ANSI codes across wrapped segments. */
function wrapLine(text: string, maxWidth: number, continuationIndent: string): string[] {
  const visibleLen = stripAnsi(text).length
  if (visibleLen <= maxWidth) return [text]

  const tokens = text.match(TOKEN_RE) ?? [text]

  const lines: string[] = []
  let currentLine = ''
  let currentVisibleLen = 0

  for (const token of tokens) {
    const tokenVisible = stripAnsi(token).length
    const separator = currentLine === '' ? '' : ' '
    const separatorLen = separator.length

    if (currentLine !== '' && currentVisibleLen + separatorLen + tokenVisible > maxWidth) {
      lines.push(currentLine)
      currentLine = continuationIndent + token
      currentVisibleLen = continuationIndent.length + tokenVisible
    } else {
      currentLine += separator + token
      currentVisibleLen += separatorLen + tokenVisible
    }
  }

  if (currentLine !== '') {
    lines.push(currentLine)
  }

  return lines
}

/** Format label/description pairs into aligned two-column table rows. */
function formatTable(rows: readonly (readonly [string, string])[]): string[] {
  if (rows.length === 0) return []

  const maxLabel = Math.max(...rows.map(([label]) => stripAnsi(label).length))
  const padding = 4

  return rows.map(([label, desc]) => {
    const visibleLen = stripAnsi(label).length
    const pad = ' '.repeat(maxLabel - visibleLen + padding)
    return `  ${label}${pad}${desc}`
  })
}
