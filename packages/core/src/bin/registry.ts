import { existsSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

const LOCKFILES = [
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
]

/**
 * Walk up from `startDir` to the project root.
 *
 * The root is the nearest ancestor containing a package-manager lockfile —
 * lockfiles exist only at install roots, so the marker is immune to nested
 * workspace `package.json`s and to stray `.git` directories tools sometimes
 * leave behind. When no lockfile exists (e.g. a project before its first
 * install), the outermost ancestor containing a `package.json` is used —
 * every project has one, monorepo or not, git or not.
 *
 * Returns `undefined` when neither marker is found.
 */
export function findProjectRoot(startDir: string): string | undefined {
  let dir = startDir
  const { root } = parse(dir)
  let outermostPackageJson: string | undefined
  while (true) {
    if (LOCKFILES.some(lockfile => existsSync(join(dir, lockfile)))) return dir
    if (existsSync(join(dir, 'package.json'))) outermostPackageJson = dir
    if (dir === root) return outermostPackageJson
    dir = dirname(dir)
  }
}

export interface DevRegistryEnv {
  MINIFLARE_REGISTRY_PATH?: string
  WRANGLER_REGISTRY_PATH?: string
}

/**
 * Resolve the Miniflare dev-registry path for a quarry run.
 *
 * Precedence:
 *  1. an explicit `MINIFLARE_REGISTRY_PATH` (the variable Miniflare actually
 *     reads) or `WRANGLER_REGISTRY_PATH` (the variable `wrangler dev` reads —
 *     honoured here too so one override redirects every tool the same way)
 *  2. `<projectRoot>/.wrangler/registry` (see `findProjectRoot`) — so every
 *     process in a checkout (dev servers, quarry CLI runs) deterministically
 *     shares one registry, and parallel checkouts (git worktrees) each get
 *     their own.
 *
 * The global `~/.wrangler/registry` is deliberately never used: a registry
 * shared across checkouts lets identically-named workers from parallel dev
 * environments overwrite each other and breaks service-binding resolution.
 */
export function resolveDevRegistryPath(env: DevRegistryEnv, cwd: string): string {
  const explicit = env.MINIFLARE_REGISTRY_PATH ?? env.WRANGLER_REGISTRY_PATH
  if (explicit) return explicit
  return join(findProjectRoot(cwd) ?? cwd, '.wrangler', 'registry')
}
