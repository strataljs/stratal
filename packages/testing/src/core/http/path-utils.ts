/**
 * Get value at dot-notation path.
 */
export function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Check if a path exists in the object (even if value is null/undefined).
 */
export function hasValueAtPath(obj: unknown, path: string): boolean {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return false
    }

    if (typeof current !== 'object') {
      return false
    }

    const record = current as Record<string, unknown>

    if (!(part in record)) {
      return false
    }

    current = record[part]
  }

  return true
}
