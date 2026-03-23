import { beforeEach, describe, expect, it } from 'vitest'
import type { InertiaModuleOptions } from '../inertia.options'
import type { InertiaPage } from '../types'
import { ManifestService } from '../services/manifest.service'
import { TemplateService } from '../services/template.service'

describe('TemplateService', () => {
  let service: TemplateService
  let manifest: ManifestService

  const rootView = `<!DOCTYPE html>
<html>
<head>@viteHead
@inertiaHead</head>
<body>@inertia
@viteScripts</body>
</html>`

  const options: InertiaModuleOptions = { rootView }

  const page: InertiaPage = {
    component: 'Home',
    props: { message: 'Hello' },
    url: '/',
    version: '1.0',
    mergeProps: [],
    deferredProps: {},
    encryptHistory: false,
    clearHistory: false,
  }

  beforeEach(() => {
    manifest = new ManifestService()
    service = new TemplateService(options, manifest)
  })

  it('should replace @inertia with data-page div', () => {
    const html = service.render(page, [], '')
    expect(html).toContain('<div id="app" data-page="')
    expect(html).toContain('</div>')
  })

  it('should include SSR body inside the app div', () => {
    const html = service.render(page, [], '<h1>Hello</h1>')
    expect(html).toContain('<h1>Hello</h1></div>')
  })

  it('should replace @inertiaHead with SSR head tags', () => {
    const html = service.render(page, ['<title>Test</title>', '<meta name="desc" />'], '')
    expect(html).toContain('<title>Test</title>')
    expect(html).toContain('<meta name="desc" />')
  })

  it('should escape HTML entities in data-page JSON', () => {
    const xssPage: InertiaPage = {
      ...page,
      props: { html: '<script>alert("xss")</script>' },
    }
    const html = service.render(xssPage, [], '')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('should replace @viteHead and @viteScripts with manifest tags', () => {
    manifest.setManifest({
      'src/inertia/app.tsx': {
        file: 'assets/app-abc.js',
        css: ['assets/app-abc.css'],
        isEntry: true,
      },
    })

    const html = service.render(page, [], '')
    expect(html).toContain('<link rel="stylesheet" href="/assets/app-abc.css" />')
    expect(html).toContain('<script type="module" src="/assets/app-abc.js"></script>')
  })
})
