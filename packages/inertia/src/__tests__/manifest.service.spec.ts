import { describe, expect, it } from 'vitest'
import type { InertiaModuleOptions } from '../inertia.options'
import { ManifestService } from '../services/manifest.service'

function createService(options: Partial<InertiaModuleOptions> = {}): ManifestService {
  return new (ManifestService as any)({ rootView: '', ...options })
}

describe('ManifestService', () => {
  describe('getHeadTags()', () => {
    it('should return SSR CSS link tag in dev mode', () => {
      const service = createService()
      const tags = service.getHeadTags()
      expect(tags).toContain('/__inertia/ssr-css')
      expect(tags).toContain('data-ssr-css')
    })

    it('should return CSS link tags from manifest', () => {
      const service = createService({
        manifest: {
          'src/inertia/app.tsx': {
            file: 'assets/app-abc123.js',
            css: ['assets/app-abc123.css', 'assets/vendor-def456.css'],
            isEntry: true,
          },
        },
      })

      const tags = service.getHeadTags()
      expect(tags).toContain('<link rel="stylesheet" href="/assets/app-abc123.css" />')
      expect(tags).toContain('<link rel="stylesheet" href="/assets/vendor-def456.css" />')
    })
  })

  describe('getScriptTags()', () => {
    it('should return @vite/client, HMR cleanup script, and entry script in dev mode', () => {
      const service = createService()

      const tags = service.getScriptTags()
      expect(tags).toContain('/@vite/client')
      expect(tags).toContain('createHotContext')
      expect(tags).toContain('data-ssr-css')
      expect(tags).toContain('/src/inertia/app.tsx')
    })

    it('should use custom entry client path in dev mode', () => {
      const service = createService({ entryClientPath: 'src/client/main.tsx' })

      const tags = service.getScriptTags()
      expect(tags).toContain('/src/client/main.tsx')
    })

    it('should return entry script tags from manifest', () => {
      const service = createService({
        manifest: {
          'src/inertia/app.tsx': {
            file: 'assets/app-abc123.js',
            isEntry: true,
          },
          'src/inertia/vendor.tsx': {
            file: 'assets/vendor-def456.js',
            isEntry: false,
          },
        },
      })

      const tags = service.getScriptTags()
      expect(tags).toContain('<script type="module" src="/assets/app-abc123.js"></script>')
      expect(tags).not.toContain('vendor-def456')
    })
  })
})
