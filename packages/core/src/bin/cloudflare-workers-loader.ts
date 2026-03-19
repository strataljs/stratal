/**
 * ESM loader hook that provides a virtual `cloudflare:workers` module.
 *
 * When registered via `node --import` or `register()`, this intercepts
 * `import('cloudflare:workers')` and returns a module that reads `env`
 * and `waitUntil` from `globalThis.__stratalPlatformProxy`.
 */

const VIRTUAL_URL = 'cloudflare-workers:virtual'

interface ResolveContext {
  parentURL?: string
  conditions: string[]
}

interface ResolveResult {
  url: string
  shortCircuit?: boolean
}

type NextResolve = (specifier: string, context: ResolveContext) => Promise<ResolveResult>

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): Promise<ResolveResult> {
  if (specifier === 'cloudflare:workers') {
    return { url: VIRTUAL_URL, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

interface LoadContext {
  format?: string
  conditions: string[]
}

interface LoadResult {
  format: string
  source: string
  shortCircuit?: boolean
}

type NextLoad = (url: string, context: LoadContext) => Promise<LoadResult>

export async function load(
  url: string,
  context: LoadContext,
  nextLoad: NextLoad,
): Promise<LoadResult> {
  if (url === VIRTUAL_URL) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
const proxy = globalThis.__stratalPlatformProxy;
if (!proxy) throw new Error('globalThis.__stratalPlatformProxy not set — Quarry CLI must initialize it before importing the app entry.');
export const env = proxy.env;
export const waitUntil = proxy.waitUntil;
`,
    }
  }
  return nextLoad(url, context)
}
