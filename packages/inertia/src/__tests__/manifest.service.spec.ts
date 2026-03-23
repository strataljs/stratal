import { beforeEach, describe, expect, it } from 'vitest'
import { ManifestService } from '../services/manifest.service'

describe('ManifestService', () => {
  let service: ManifestService

  beforeEach(() => {
    service = new ManifestService()
  })

  describe('getHeadTags()', () => {
    it('should return empty string when no manifest or dev server', () => {
      expect(service.getHeadTags()).toBe('')
    })

    it('should return empty string in dev mode', () => {
      service.setDevServerUrl('http://localhost:5173')
      expect(service.getHeadTags()).toBe('')
    })

    it('should return CSS link tags from manifest', () => {
      service.setManifest({
        'src/inertia/app.tsx': {
          file: 'assets/app-abc123.js',
          css: ['assets/app-abc123.css', 'assets/vendor-def456.css'],
          isEntry: true,
        },
      })

      const tags = service.getHeadTags()
      expect(tags).toContain('<link rel="stylesheet" href="/assets/app-abc123.css" />')
      expect(tags).toContain('<link rel="stylesheet" href="/assets/vendor-def456.css" />')
    })
  })

  describe('getScriptTags()', () => {
    it('should return empty string when no manifest or dev server', () => {
      expect(service.getScriptTags()).toBe('')
    })

    it('should return Vite client + entry script in dev mode', () => {
      service.setDevServerUrl('http://localhost:5173')

      const tags = service.getScriptTags()
      expect(tags).toContain('http://localhost:5173/@vite/client')
      expect(tags).toContain('http://localhost:5173/src/inertia/app.tsx')
    })

    it('should return entry script tags from manifest', () => {
      service.setManifest({
        'src/inertia/app.tsx': {
          file: 'assets/app-abc123.js',
          isEntry: true,
        },
        'src/inertia/vendor.tsx': {
          file: 'assets/vendor-def456.js',
          isEntry: false,
        },
      })

      const tags = service.getScriptTags()
      expect(tags).toContain('<script type="module" src="/assets/app-abc123.js"></script>')
      expect(tags).not.toContain('vendor-def456')
    })
  })
})
