import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '@inertiajs/core'
import type { InertiaModuleOptions } from '../inertia.options'
import { ManifestService } from '../services/manifest.service'
import { TemplateService } from '../services/template.service'
import type { ViteManifest } from '../types'

interface ManifestGlobal {
  __STRATAL_INERTIA_MANIFEST__?: ViteManifest
}

function createManifest(options: Partial<InertiaModuleOptions> = {}): ManifestService {
  return new (ManifestService as any)({ rootView: '', ...options })
}

beforeEach(() => {
  vi.stubEnv('DEV', true)
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete (globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__
})

function createPage(overrides: Partial<Page> = {}): Page {
  return {
    component: 'Home',
    props: { message: 'Hello', errors: {} },
    url: '/',
    version: '1.0',
    flash: {},
    rememberedState: {},
    rescuedProps: [],
    ...overrides,
  }
}

describe('TemplateService', () => {
  const rootView = `<!DOCTYPE html>
<html>
<head>@viteHead
@inertiaHead</head>
<body>@inertia
@viteScripts</body>
</html>`

  const options: InertiaModuleOptions = { rootView }

  const page = createPage()

  it('should output script tag with page JSON and empty #app div without SSR', () => {
    const manifest = createManifest()
    const service = new (TemplateService as any)(options, manifest)
    const html = service.render(page, [], '')
    expect(html).toContain('<script data-page="app" type="application/json">')
    expect(html).toContain('<div id="app"></div>')
  })

  it('should use SSR body directly as the app container', () => {
    const manifest = createManifest()
    const service = new (TemplateService as any)(options, manifest)
    const ssrBody = '<script data-page="app" type="application/json">{}</script><div id="app" data-server-rendered="true"><h1>Hello</h1></div>'
    const html = service.render(page, [], ssrBody)
    expect(html).toContain(ssrBody)
    // Should NOT double-wrap in another #app div
    expect(html).not.toMatch(/<div id="app"[^>]*>.*<div id="app"/s)
  })

  it('should replace @inertiaHead with SSR head tags', () => {
    const manifest = createManifest()
    const service = new (TemplateService as any)(options, manifest)
    const html = service.render(page, ['<title>Test</title>', '<meta name="desc" />'], '')
    expect(html).toContain('<title>Test</title>')
    expect(html).toContain('<meta name="desc" />')
  })

  it('should escape forward slashes in page JSON', () => {
    const manifest = createManifest()
    const service = new (TemplateService as any)(options, manifest)
    const xssPage = createPage({
      props: { html: '</script><script>alert("xss")', errors: {} },
    })
    const html = service.render(xssPage, [], '')
    expect(html).not.toContain('</script><script>alert')
    expect(html).toContain('<\\/script>')
  })

  it('should preserve $-sequences in head/body content verbatim', () => {
    const manifest = createManifest()
    const service = new (TemplateService as any)(options, manifest)
    // A string replacement would interpret `$$`, `$&`, `$\`` and `$'` — corrupting
    // SEO/page content that legitimately contains `$` and even splicing the
    // placeholder token back in.
    const title = '<title>Buy now: $$$ &amp; save $&amp; — `$`` deals</title>'
    const html = service.render(page, [title], '')
    expect(html).toContain(title)
    expect(html).not.toContain('@inertiaHead')
  })

  it('should replace @viteHead and @viteScripts with manifest tags', () => {
    vi.stubEnv('DEV', false)
    ;(globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__ = {
      'src/inertia/app.tsx': {
        file: 'assets/app-abc.js',
        css: ['assets/app-abc.css'],
        isEntry: true,
      },
    }
    const manifest = createManifest()
    const service = new (TemplateService as any)(options, manifest)

    const html = service.render(page, [], '')
    expect(html).toContain('<link rel="stylesheet" href="/assets/app-abc.css" />')
    expect(html).toContain('<script type="module" src="/assets/app-abc.js"></script>')
  })
})
