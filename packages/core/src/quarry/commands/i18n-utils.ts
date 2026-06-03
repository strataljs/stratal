export function computeKeyDiff(
  baseKeys: Set<string>,
  targetKeys: Set<string>,
): { missing: string[]; extra: string[] } {
  const missing: string[] = []
  const extra: string[] = []

  for (const key of baseKeys) {
    if (!targetKeys.has(key)) missing.push(key)
  }
  for (const key of targetKeys) {
    if (!baseKeys.has(key)) extra.push(key)
  }

  return { missing: missing.sort(), extra: extra.sort() }
}

export function extractNamespace(key: string, depth: number): string {
  return key.split('.').slice(0, depth).join('.')
}
