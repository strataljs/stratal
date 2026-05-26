/**
 * ESM loader hook that provides virtual modules for Cloudflare-specific imports
 * and handles Vite-style `?raw` imports (returning file contents as a string).
 *
 * When registered via `node --import` or `register()`, this intercepts:
 * - `cloudflare:workers` — virtual env/waitUntil from `globalThis.__stratalPlatformProxy`
 * - `cloudflare:sockets` — Node.js TCP/TLS implementation of the CF connect() API
 * - `?raw` imports — returns file contents as a default string export
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const VIRTUAL_WORKERS_URL = 'cloudflare-workers:virtual'
const VIRTUAL_SOCKETS_URL = 'cloudflare-sockets:virtual'
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
    return { url: VIRTUAL_WORKERS_URL, shortCircuit: true }
  }
  if (specifier === 'cloudflare:sockets') {
    return { url: VIRTUAL_SOCKETS_URL, shortCircuit: true }
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
  if (url === VIRTUAL_WORKERS_URL) {
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
  if (url === VIRTUAL_SOCKETS_URL) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

export function connect(address, options) {
  const hostname = typeof address === 'string' ? address : address.hostname;
  const port = typeof address === 'string' ? 443 : address.port;
  const secureTransport = options?.secureTransport ?? 'off';

  let currentSocket;
  if (secureTransport === 'on') {
    currentSocket = tlsConnect({ host: hostname, port, servername: hostname });
  } else {
    currentSocket = netConnect({ host: hostname, port });
  }

  let dataHandler, endHandler;

  const readable = new ReadableStream({
    start(controller) {
      dataHandler = (chunk) => {
        try { controller.enqueue(new Uint8Array(chunk)); } catch {}
      };
      endHandler = () => {
        try { controller.close(); } catch {}
      };
      currentSocket.on('data', dataHandler);
      currentSocket.on('end', endHandler);
      currentSocket.on('error', (err) => {
        try { controller.error(err); } catch {}
      });
    }
  });

  const writable = new WritableStream({
    write(chunk) {
      return new Promise((resolve, reject) => {
        currentSocket.write(Buffer.from(chunk), (err) => err ? reject(err) : resolve());
      });
    }
  });

  const closedPromise = new Promise((resolve) => currentSocket.on('close', resolve));

  return {
    readable,
    writable,
    startTls() {
      currentSocket.removeListener('data', dataHandler);
      currentSocket.removeListener('end', endHandler);
      const tlsSocket = tlsConnect({ socket: currentSocket, servername: hostname });
      currentSocket = tlsSocket;
      tlsSocket.on('data', dataHandler);
      tlsSocket.on('end', endHandler);
    },
    close() { currentSocket.destroy(); },
    closed: closedPromise,
  };
}
`,
    }
  }
  return nextLoad(url, context)
}
