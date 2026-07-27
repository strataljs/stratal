import type { MiniflareOptions } from 'miniflare';
import { existsSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import type { QuarryRegistry } from 'stratal/quarry';
import { type Application } from '../application';
import { extractEnvFlag } from './argv';
import { createDynamicCommands } from './commands/dynamic-command';
import { resolveDevRegistryPath } from './registry';
import { stripWorkflowBindings } from './workflow-bindings';

interface WranglerConfig {
  name?: string
  vars?: Record<string, unknown>
}

interface MiniflareWorkerResult {
  workerOptions: Record<string, unknown>
}

interface RemoteProxySessionData {
  session: {
    ready: Promise<unknown>
    dispose: () => Promise<void>
    remoteProxyConnectionString: unknown
  }
  remoteBindings: Record<string, unknown>
}

interface WranglerModule {
  unstable_readConfig: (args: { config?: string; env?: string }) => WranglerConfig
  unstable_getMiniflareWorkerOptions: (config: WranglerConfig, env?: string, options?: { remoteProxyConnectionString?: unknown }) => MiniflareWorkerResult
  unstable_getVarsForDev: (configPath: string | undefined, envFiles: undefined, vars: unknown, env: string | undefined) => Record<string, { value: string }>
  maybeStartOrUpdateRemoteProxySession: (config: { path: string; environment?: string }) => Promise<RemoteProxySessionData | null>
}

interface MiniflareModule {
  Miniflare: new (opts: MiniflareOptions) => { ready: Promise<URL>; getBindings: (name?: string) => Promise<Record<string, unknown>>; dispose: () => Promise<void> }
}

const require = createRequire(import.meta.url)

// Register @swc-node/register for TypeScript + decorator support
const swcRegisterPath = join(dirname(require.resolve('@swc-node/register')), 'esm/esm.mjs')
register(pathToFileURL(swcRegisterPath), pathToFileURL('./'))

// Register cloudflare:workers virtual module loader
register(new URL('./cloudflare-workers-loader.mjs', import.meta.url), pathToFileURL('./'))

const DEFAULT_ENTRY = './src/quarry.ts'

let environment: string | undefined
try {
  const parsed = extractEnvFlag(process.argv.slice(2))
  environment = parsed.env
  process.argv.splice(2, process.argv.length - 2, ...parsed.rest)
} catch (e) {
  console.error(`Error: ${(e as Error).message}`)
  process.exit(1)
}

// Determine entry file: if first arg looks like a file path, use it; otherwise use default
const firstArg = process.argv[2]
let entryFile = DEFAULT_ENTRY

if (firstArg && (firstArg.includes('/') || firstArg.includes('\\') || /\.(ts|js|mts|mjs)$/.test(firstArg))) {
  entryFile = firstArg
  // Remove the entry file from argv so Clipanion sees: [node, script, command, ...options]
  process.argv.splice(2, 1)
}

// Resolve and validate the entry file
const entryPath = resolve(process.cwd(), entryFile)

if (!existsSync(entryPath)) {
  console.error(`Error: Entry file not found: ${entryFile}`)
  console.error('')
  console.error('Create src/quarry.ts that exports `QuarryRunner.run({ module, seeders })`, or specify a custom path:')
  console.error('  npx quarry ./path/to/entry.ts <command> [options]')
  process.exit(1)
}

async function main(): Promise<void> {
  const cwdRequire = createRequire(join(process.cwd(), 'package.json'))

  const { unstable_readConfig: readConfig, unstable_getMiniflareWorkerOptions: getMiniflareWorkerOptions, unstable_getVarsForDev: getVarsForDev, maybeStartOrUpdateRemoteProxySession } = await import(cwdRequire.resolve('wrangler')) as WranglerModule
  const { Miniflare } = await import(cwdRequire.resolve('miniflare')) as MiniflareModule

  const candidates = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']
  const configName = candidates.find(c => existsSync(resolve(process.cwd(), c)))
  const configPath = configName ? resolve(process.cwd(), configName) : undefined

  // Load .env into process.env before building Miniflare options, mirroring
  // `wrangler dev`'s precedence: base `.env`, then `.env.local`, then the
  // env-specific `.env.<environment>` and `.env.<environment>.local` (later
  // load wins).
  const envFiles = [
    '.env',
    '.env.local',
    environment ? `.env.${environment}` : null,
    environment ? `.env.${environment}.local` : null,
  ]
  for (const envFile of envFiles) {
    if (!envFile) continue
    const envPath = resolve(process.cwd(), envFile)
    if (existsSync(envPath)) process.loadEnvFile(envPath)
  }

  // Deterministically resolve the dev service registry from the project root
  // (`<projectRoot>/.wrangler/registry`) so a bare `quarry` invocation shares
  // the SAME project-local registry every other process in this checkout uses —
  // never the global `~/.wrangler/registry`, where parallel checkouts'
  // identically-named workers would overwrite each other and break cross-worker
  // service-binding resolution. An explicit `WRANGLER_REGISTRY_PATH` /
  // `MINIFLARE_REGISTRY_PATH` (from the shell or the `.env` files above) wins.
  //
  // Exported as `MINIFLARE_REGISTRY_PATH` — the variable Miniflare's
  // `getDefaultDevRegistryPath()` reads at call time — so any child process a
  // command spawns (notably the vite dev server launched by `inertia:dev`,
  // whose `@cloudflare/vite-plugin` resolves its registry the same way) lands
  // in the identical registry.
  const registryPath = resolveDevRegistryPath({
    MINIFLARE_REGISTRY_PATH: process.env.MINIFLARE_REGISTRY_PATH,
    WRANGLER_REGISTRY_PATH: process.env.WRANGLER_REGISTRY_PATH,
  }, process.cwd())
  process.env.MINIFLARE_REGISTRY_PATH = registryPath

  const config = readConfig({ config: configPath, env: environment })

  // Honor `remote: true` bindings (wrangler remote bindings): start a proxy
  // session against the deployed Cloudflare resources and thread its
  // connection string into the Miniflare worker options, so e.g. a service
  // binding marked remote calls the deployed worker instead of the local dev
  // registry. Returns null when the resolved config declares no remote
  // bindings — plain local runs are untouched. Requires wrangler credentials
  // (`wrangler login` / CLOUDFLARE_API_TOKEN) when a session does start.
  const remoteProxy = configPath
    ? await maybeStartOrUpdateRemoteProxySession({ path: configPath, environment })
    : null
  if (remoteProxy) {
    await remoteProxy.session.ready
    const remoteNames = Object.keys(remoteProxy.remoteBindings)
    console.log(`Remote bindings: proxying ${remoteNames.length} binding(s) to deployed resources (${remoteNames.join(', ')})`)
  }

  const { workerOptions } = getMiniflareWorkerOptions(config, environment, {
    remoteProxyConnectionString: remoteProxy?.session.remoteProxyConnectionString,
  })

  // Always source `process.env` into the worker vars/secrets — quarry is a CLI/CI tool, so config passed
  // through the environment must resolve like any other binding. `getVarsForDev` (and the vite build
  // quarry spawns for `inertia:build`, which inherits this process env) only merges `process.env` when
  // `CLOUDFLARE_INCLUDE_PROCESS_ENV` is set, and it defaults OFF — and only when no `.dev.vars` shadows
  // it, so local runs (which have a `.dev.vars`) are unchanged while CI runs (no `.dev.vars`) resolve
  // env-provided config instead of failing validation on a missing binding.
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'true'
  const vars = getVarsForDev(configPath, undefined, config.vars, environment)
  const varsRecord: Record<string, string> = {}
  for (const [key, binding] of Object.entries(vars)) {
    varsRecord[key] = binding.value
  }

  const existingBindings = workerOptions.bindings as Record<string, unknown> ?? {}
  workerOptions.bindings = {
    ...existingBindings,
    ...varsRecord,
    QUEUE_PROVIDER: 'sync',
  }

  // The quarry worker runs an empty script (`script: ''` below), so it can't own
  // a Workflow entrypoint, and a sourceless CLI host can't reach a Workflow
  // defined in another worker either (it boots before that worker exists, and
  // Workflows can't be remote bindings). Drop the Workflow bindings so Miniflare
  // doesn't stand up an engine demanding an entrypoint this host can't provide —
  // see stripWorkflowBindings. Surfaced (not silent) so a command that expects
  // one sees why it's absent; triggering must happen from the defining worker.
  const strippedWorkflows = stripWorkflowBindings(workerOptions)
  if (strippedWorkflows.length > 0) {
    console.log(`Workflow binding(s) unavailable to CLI commands (defined on the worker, not this host): ${strippedWorkflows.join(', ')}`)
  }

  // Rename so quarry doesn't overwrite a running `wrangler dev` session's
  // dev-registry entry. The registry is how Miniflare discovers peer workers
  // for service binding resolution — a collision would break the running session.
  const workerName = config.name ? `quarry-${config.name}-${process.pid}` : `quarry-${process.pid}`
  workerOptions.name = workerName

  const mf = new Miniflare({
    ...workerOptions,
    script: '',
    modules: true,
    unsafeDevRegistryPath: registryPath,
    // Persist every durable plugin (KV, D1, R2, Durable Objects, cache) under
    // the same root `wrangler dev` uses, so state survives across `quarry`
    // invocations and is shared with a running `wrangler dev` session.
    defaultPersistRoot: join(process.cwd(), '.wrangler/state/v3'),
  })

  await mf.ready
  const env = await mf.getBindings()

  const pendingPromises: Promise<unknown>[] = []
  const trackedWaitUntil = (promise: Promise<unknown>) => {
    pendingPromises.push(promise)
  }

  let app: Application | undefined
  try {
    (globalThis as Record<string, unknown>).__stratalPlatformProxy = {
      env,
      waitUntil: trackedWaitUntil,
    }

    await import(pathToFileURL(entryPath).href)

    const [
      { Stratal },
      { DI_TOKENS },
      { parseSignature },
    ] = await Promise.all([
      import('stratal'),
      import('stratal/di'),
      import('stratal/quarry'),
    ])

    app = await Stratal.resolveApplication()
    const quarry = app.container.resolve<QuarryRegistry>(DI_TOKENS.Quarry)

    const { Cli } = await import('clipanion')
    const pkg = require('../../package.json') as { version: string }

    const cli = new Cli({
      binaryName: 'quarry',
      binaryLabel: 'Quarry CLI',
      binaryVersion: pkg.version,
    })

    for (const cmd of createDynamicCommands(quarry, parseSignature, app)) {
      cli.register(cmd)
    }

    await cli.runExit(process.argv.slice(2), { ...Cli.defaultContext })
  } finally {
    await Promise.allSettled(pendingPromises)
    await app?.shutdown()
    await mf.dispose()
    await remoteProxy?.session.dispose()
  }
}

main().catch(async (error: unknown) => {
  const { ConfigValidationError } = await import('stratal/config')

  const message = error instanceof Error ? error.message : String(error)
  console.error('Fatal error:', message)
  if (error instanceof ConfigValidationError) {
    console.error(error.errors.message)
  }
  process.exit(1)
})
