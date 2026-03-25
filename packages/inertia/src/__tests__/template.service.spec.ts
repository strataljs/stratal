import { describe, expect, it } from 'vitest'
import type { Page } from '@inertiajs/core'
import type { InertiaModuleOptions } from '../inertia.options'
import { ManifestService } from '../services/manifest.service'
import { TemplateService } from '../services/template.service'

function createManifest(options: Partial<InertiaModuleOptions> = {}): ManifestService {
  return new (ManifestService as any)({ rootView: '', ...options })
}

function createPage(overrides: Partial<Page> = {}): Page {
  return {
    component: 'Home',
    props: { message: 'Hello', errors: {} },
    url: '/',
    version: '1.0',
    flash: {},
    rememberedState: {},
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

  it('should replace @viteHead and @viteScripts with manifest tags', () => {
    const manifest = createManifest({
      manifest: {
        'src/inertia/app.tsx': {
          file: 'assets/app-abc.js',
          css: ['assets/app-abc.css'],
          isEntry: true,
        },
      },
    })
    const service = new (TemplateService as any)(options, manifest)

    const html = service.render(page, [], '')
    expect(html).toContain('<link rel="stylesheet" href="/assets/app-abc.css" />')
    expect(html).toContain('<script type="module" src="/assets/app-abc.js"></script>')
  })
})
