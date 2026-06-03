import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InertiaModuleOptions } from '../inertia.options'
import { ManifestService } from '../services/manifest.service'
import type { ViteManifest } from '../types'

function createService(options: Partial<InertiaModuleOptions> = {}): ManifestService {
  return new (ManifestService as any)({ rootView: '', ...options })
}

interface ManifestGlobal {
  __STRATAL_INERTIA_MANIFEST__?: ViteManifest
}

describe('ManifestService', () => {
  beforeEach(() => {
    delete (globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__
  })

  describe('dev mode', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', true)
    })

    it('returns SSR CSS link tag', () => {
      const service = createService()
      const tags = service.getHeadTags()
      expect(tags).toContain('/__inertia/ssr-css')
      expect(tags).toContain('data-ssr-css')
    })

    it('returns @vite/client, HMR cleanup script, and entry script', () => {
      const service = createService()
      const tags = service.getScriptTags()
      expect(tags).toContain('/@vite/client')
      expect(tags).toContain('createHotContext')
      expect(tags).toContain('data-ssr-css')
      expect(tags).toContain('/src/inertia/app.tsx')
    })

    it('uses custom entry client path', () => {
      const service = createService({ entryClientPath: 'src/client/main.tsx' })
      const tags = service.getScriptTags()
      expect(tags).toContain('/src/client/main.tsx')
    })
  })

  describe('production mode', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', false)
    })

    it('reads CSS link tags from the manifest injected on globalThis', () => {
      (globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__ = {
        'src/inertia/app.tsx': {
          file: 'assets/app-abc123.js',
          css: ['assets/app-abc123.css', 'assets/vendor-def456.css'],
          isEntry: true,
        },
      }

      const service = createService()
      const tags = service.getHeadTags()
      expect(tags).toContain('<link rel="stylesheet" href="/assets/app-abc123.css" />')
      expect(tags).toContain('<link rel="stylesheet" href="/assets/vendor-def456.css" />')
    })

    it('reads entry script tags from the manifest injected on globalThis', () => {
      (globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__ = {
        'src/inertia/app.tsx': {
          file: 'assets/app-abc123.js',
          isEntry: true,
        },
        'src/inertia/vendor.tsx': {
          file: 'assets/vendor-def456.js',
          isEntry: false,
        },
      }

      const service = createService()
      const tags = service.getScriptTags()
      expect(tags).toContain('<script type="module" src="/assets/app-abc123.js"></script>')
      expect(tags).not.toContain('vendor-def456')
    })

    it('throws when no manifest is injected on globalThis', () => {
      expect(() => createService()).toThrow(/production build is missing the Vite client manifest/)
    })

    it('memoizes the derived head/script tag strings (builds each once)', () => {
      (globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__ = {
        'src/inertia/app.tsx': {
          file: 'assets/app-abc123.js',
          css: ['assets/app-abc123.css'],
          isEntry: true,
        },
      }

      const service = createService()
      // Spy on the builders to prove the result is cached, not rebuilt — string
      // value-equality alone can't tell a memoized result from a fresh identical one.
      const buildHead = vi.spyOn(service as unknown as { buildHeadTags(): string }, 'buildHeadTags')
      const buildScripts = vi.spyOn(service as unknown as { buildScriptTags(): string }, 'buildScriptTags')

      expect(service.getHeadTags()).toBe(service.getHeadTags())
      expect(service.getScriptTags()).toBe(service.getScriptTags())
      expect(buildHead).toHaveBeenCalledTimes(1)
      expect(buildScripts).toHaveBeenCalledTimes(1)
    })
  })
})
