export async function forceGc(): Promise<void> {
  if (typeof globalThis.gc !== 'function') {
    throw new Error(
      'forceGc requires Node to be started with --expose-gc (set via NODE_OPTIONS in the package.json test scripts).'
    )
  }
  for (let i = 0; i < 5; i++) {
    globalThis.gc()
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
