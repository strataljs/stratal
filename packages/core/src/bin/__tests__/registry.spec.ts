import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findProjectRoot, resolveDevRegistryPath } from '../registry'

const cleanups: string[] = []

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quarry-registry-'))
  cleanups.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('findProjectRoot', () => {
  it.each(['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb'])(
    'finds the nearest ancestor containing %s',
    (lockfile) => {
      const root = makeFixture()
      writeFileSync(join(root, lockfile), '')
      const nested = join(root, 'apps', 'data-plane')
      mkdirSync(nested, { recursive: true })

      expect(findProjectRoot(nested)).toBe(root)
    },
  )

  it('prefers the lockfile root over nested workspace package.json files', () => {
    const root = makeFixture()
    writeFileSync(join(root, 'yarn.lock'), '')
    writeFileSync(join(root, 'package.json'), '{}')
    const nested = join(root, 'apps', 'data-plane')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'package.json'), '{}')

    expect(findProjectRoot(nested)).toBe(root)
  })

  it('is not fooled by stray .git directories inside the workspace', () => {
    const root = makeFixture()
    writeFileSync(join(root, 'yarn.lock'), '')
    const nested = join(root, 'apps', 'data-plane')
    mkdirSync(join(nested, '.git'), { recursive: true })

    expect(findProjectRoot(nested)).toBe(root)
  })

  it('keeps a nested checkout with its own lockfile isolated from the outer one', () => {
    const outer = makeFixture()
    writeFileSync(join(outer, 'yarn.lock'), '')
    const inner = join(outer, '.claude', 'worktrees', 'fix')
    mkdirSync(inner, { recursive: true })
    writeFileSync(join(inner, 'yarn.lock'), '')
    const nested = join(inner, 'apps', 'data-plane')
    mkdirSync(nested, { recursive: true })

    expect(findProjectRoot(nested)).toBe(inner)
  })

  it('returns the start directory itself when it holds the lockfile', () => {
    const root = makeFixture()
    writeFileSync(join(root, 'yarn.lock'), '')

    expect(findProjectRoot(root)).toBe(root)
  })

  it('uses the outermost package.json when no lockfile exists', () => {
    const root = makeFixture()
    writeFileSync(join(root, 'package.json'), '{}')
    const nested = join(root, 'apps', 'data-plane')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'package.json'), '{}')

    expect(findProjectRoot(nested)).toBe(root)
  })

  it('returns undefined when no marker is found', () => {
    const dir = makeFixture()

    expect(findProjectRoot(dir)).toBeUndefined()
  })
})

describe('resolveDevRegistryPath', () => {
  it('honours an explicit MINIFLARE_REGISTRY_PATH', () => {
    expect(resolveDevRegistryPath({ MINIFLARE_REGISTRY_PATH: '/explicit/mf' }, '/anywhere')).toBe('/explicit/mf')
  })

  it('honours an explicit WRANGLER_REGISTRY_PATH', () => {
    expect(resolveDevRegistryPath({ WRANGLER_REGISTRY_PATH: '/explicit/wr' }, '/anywhere')).toBe('/explicit/wr')
  })

  it('prefers MINIFLARE_REGISTRY_PATH when both are set', () => {
    const env = { MINIFLARE_REGISTRY_PATH: '/explicit/mf', WRANGLER_REGISTRY_PATH: '/explicit/wr' }

    expect(resolveDevRegistryPath(env, '/anywhere')).toBe('/explicit/mf')
  })

  it('derives <projectRoot>/.wrangler/registry from the lockfile root', () => {
    const root = makeFixture()
    writeFileSync(join(root, 'yarn.lock'), '')
    const nested = join(root, 'apps', 'data-plane')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'package.json'), '{}')

    expect(resolveDevRegistryPath({}, nested)).toBe(join(root, '.wrangler', 'registry'))
  })

  it('falls back to <cwd>/.wrangler/registry when no marker is found', () => {
    const dir = makeFixture()

    expect(resolveDevRegistryPath({}, dir)).toBe(join(dir, '.wrangler', 'registry'))
  })
})
