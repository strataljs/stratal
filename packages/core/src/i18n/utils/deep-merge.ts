/**
 * Deep merge two objects. Source values override target at leaf level.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target }

  for (const key of Object.keys(source)) {
    const targetValue = target[key]
    const sourceValue = source[key]

    if (
      typeof targetValue === 'object'
      && targetValue !== null
      && !Array.isArray(targetValue)
      && typeof sourceValue === 'object'
      && sourceValue !== null
      && !Array.isArray(sourceValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      )
    } else {
      result[key] = sourceValue
    }
  }

  return result
}
