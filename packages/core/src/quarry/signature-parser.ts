import type { ParsedArgument, ParsedOption, ParsedSignature } from './types'

/**
 * Parse a Laravel-style command signature string.
 *
 * Signature syntax:
 *   command-name {arg} ...              — flat command
 *   group subcommand {arg} ...          — subcommand hierarchy (space-separated)
 *   namespace:command {arg} ...         — namespaced flat command (colon-separated)
 *   {--flag} {--name=} {--name=default} {--name=*} {--A|name} {--name= : desc}
 *
 * Pure function, zero dependencies, edge-compatible.
 */
export function parseSignature(signature: string): ParsedSignature {
  const tokens = extractTokens(signature)
  const name = extractCommandName(signature)
  const args: ParsedArgument[] = []
  const options: ParsedOption[] = []

  for (const token of tokens) {
    const inner = token.slice(1, -1).trim() // strip { }

    if (inner.startsWith('--')) {
      options.push(parseOption(inner))
    } else {
      args.push(parseArgument(inner))
    }
  }

  return { name, arguments: args, options }
}

function extractCommandName(signature: string): string {
  const match = /^[\w:.-]+(?:\s+[\w:.-]+)*/.exec(signature)
  if (!match) {
    throw new Error(`Invalid signature: cannot extract command name from "${signature}"`)
  }
  return match[0]
}

function extractTokens(signature: string): string[] {
  const tokens: string[] = []
  const regex = /\{[^}]+\}/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(signature)) !== null) {
    tokens.push(match[0])
  }

  return tokens
}

function parseArgument(inner: string): ParsedArgument {
  const { value, description } = splitDescription(inner)

  // {name*} — array/variadic argument
  if (value.endsWith('*')) {
    return {
      name: value.slice(0, -1).trim(),
      required: true,
      isArray: true,
      description,
    }
  }

  // {name=default} — argument with default value
  const eqIdx = value.indexOf('=')
  if (eqIdx !== -1) {
    return {
      name: value.slice(0, eqIdx).trim(),
      required: false,
      default: value.slice(eqIdx + 1).trim(),
      isArray: false,
      description,
    }
  }

  // {name?} — optional argument
  if (value.endsWith('?')) {
    return {
      name: value.slice(0, -1).trim(),
      required: false,
      isArray: false,
      description,
    }
  }

  // {name} — required argument
  return {
    name: value.trim(),
    required: true,
    isArray: false,
    description,
  }
}

function parseOption(inner: string): ParsedOption {
  // Remove leading --
  const withoutDashes = inner.slice(2)
  const { value, description } = splitDescription(withoutDashes)

  // Check for alias: {--A|name...}
  let alias: string | undefined
  let optBody = value

  const pipeIdx = optBody.indexOf('|')
  if (pipeIdx !== -1) {
    alias = optBody.slice(0, pipeIdx).trim()
    optBody = optBody.slice(pipeIdx + 1).trim()
  }

  // {--name=*} — array option
  if (optBody.endsWith('=*')) {
    return {
      name: optBody.slice(0, -2).trim(),
      alias,
      isFlag: false,
      isArray: true,
      description,
    }
  }

  // {--name=default} — option with default value
  const eqIdx = optBody.indexOf('=')
  if (eqIdx !== -1) {
    const name = optBody.slice(0, eqIdx).trim()
    const defaultValue = optBody.slice(eqIdx + 1).trim()

    return {
      name,
      alias,
      isFlag: false,
      isArray: false,
      default: defaultValue || undefined,
      description,
    }
  }

  // {--flag} — boolean flag
  return {
    name: optBody.trim(),
    alias,
    isFlag: true,
    isArray: false,
    description,
  }
}

function splitDescription(value: string): { value: string; description?: string } {
  const colonIdx = value.indexOf(' : ')
  if (colonIdx === -1) {
    return { value }
  }

  return {
    value: value.slice(0, colonIdx).trim(),
    description: value.slice(colonIdx + 3).trim(),
  }
}
