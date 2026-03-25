/**
 * ESM loader hook that provides a virtual `cloudflare:workers` module
 * and handles Vite-style `?raw` imports (returning file contents as a string).
 *
 * When registered via `node --import` or `register()`, this intercepts
 * `import('cloudflare:workers')` and returns a module that reads `env`
 * and `waitUntil` from `globalThis.__stratalPlatformProxy`.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const VIRTUAL_URL = 'cloudflare-workers:virtual'
const RAW_SUFFIX = '?raw'

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
  if (specifier.endsWith(RAW_SUFFIX)) {
    const base = specifier.slice(0, -RAW_SUFFIX.length)
    const resolved = await nextResolve(base, context)
    return { url: resolved.url + RAW_SUFFIX, shortCircuit: true }
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
  if (url.endsWith(RAW_SUFFIX)) {
    const fileUrl = url.slice(0, -RAW_SUFFIX.length)
    const filePath = fileURLToPath(fileUrl)
    const content = readFileSync(filePath, 'utf-8')
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(content)}`,
    }
  }
  if (url === VIRTUAL_URL) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
const proxy = globalThis.__stratalPlatformProxy;
if (!proxy) throw new Error('globalThis.__stratalPlatformProxy not set — Quarry CLI must initialize it before importing the app entry.');
export const env = proxy.env;
export const waitUntil = proxy.waitUntil;
export const exports = {}
export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
export class WorkerEntrypoint {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
export class WorkflowEntrypoint {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
export class WorkflowStep {}
export class RpcTarget {}
export const RpcStub = function(value) { return value; };
export function withEnv(newEnv, fn) { return fn(); }
export function withExports(newExports, fn) { return fn(); }
export function withEnvAndExports(newEnv, newExports, fn) { return fn(); }
`,
    }
  }
  return nextLoad(url, context)
}
