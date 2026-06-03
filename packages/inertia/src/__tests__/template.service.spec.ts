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

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (; ;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  out += decoder.decode()
  return out
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

  function createService(opts: InertiaModuleOptions = options): { service: any; manifest: ManifestService } {
    const manifest = createManifest({ rootView: opts.rootView })
    return { service: new (TemplateService as any)(opts, manifest), manifest }
  }

  it('throws when rootView is missing the @inertia placeholder', () => {
    expect(() => createService({ rootView: '<html></html>' })).toThrow(/@inertia placeholder/)
  })

  describe('renderStream', () => {
    it('wraps the React stream in a single server-rendered #app container', async () => {
      const { service } = createService()
      const html = await readAll(service.renderStream(page, [], streamOf('<h1>Hello</h1>')))

      expect(html).toContain('<script data-page="app" type="application/json">')
      expect(html).toContain('<div data-server-rendered="true" id="app">')
      expect(html).toContain('<h1>Hello</h1>')
      expect((html.match(/<div data-server-rendered="true" id="app">/g) ?? []).length).toBe(1)
      expect(html.indexOf('<h1>Hello</h1>')).toBeGreaterThan(html.indexOf('<div data-server-rendered="true" id="app">'))
    })

    it('flushes the head (vite + inertia head) before the streamed body', async () => {
      const { service } = createService()
      const html = await readAll(service.renderStream(page, ['<title>Test</title>', '<meta name="desc" />'], streamOf('<main/>')))

      expect(html).toContain('<title>Test</title>')
      expect(html).toContain('<meta name="desc" />')
      expect(html.indexOf('<title>Test</title>')).toBeLessThan(html.indexOf('<main/>'))
    })

    it('escapes forward slashes in the page JSON to prevent script-tag breakout', async () => {
      const { service } = createService()
      const xssPage = createPage({ props: { html: '</script><script>alert("xss")', errors: {} } })
      const html = await readAll(service.renderStream(xssPage, [], streamOf('<main/>')))

      expect(html).not.toContain('</script><script>alert')
      expect(html).toContain('<\\/script>')
    })

    it('preserves $-sequences in head content verbatim', async () => {
      const { service } = createService()
      const title = '<title>Buy now: $$$ &amp; save $&amp; — `$`` deals</title>'
      const html = await readAll(service.renderStream(page, [title], streamOf('<main/>')))

      expect(html).toContain(title)
      expect(html).not.toContain('@inertiaHead')
    })

    it('streams progressively — flushes the shell and early chunks before later React chunks are produced', async () => {
      const { service } = createService()
      const encoder = new TextEncoder()

      // A React stream that emits chunk A, then parks until the test releases it,
      // then emits chunk B. Mirrors a Suspense boundary resolving after the shell.
      let releaseB!: () => void
      const bGate = new Promise<void>((resolve) => { releaseB = resolve })
      const reactStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('<div>A</div>'))
          await bGate
          controller.enqueue(encoder.encode('<div>B</div>'))
          controller.close()
        },
      })

      const reader = service.renderStream(page, [], reactStream).getReader()
      const decoder = new TextDecoder()
      let out = ''

      // Drain until chunk A is visible — all while B is still gated. If renderStream
      // buffered the whole React stream (e.g. awaited allReady), this would hang/never
      // see A without B, so we assert A arrived and B has NOT.
      while (!out.includes('<div>A</div>')) {
        const { done, value } = await reader.read()
        if (done) break
        out += decoder.decode(value, { stream: true })
      }
      expect(out).toContain('<div data-server-rendered="true" id="app">')
      expect(out).toContain('<div>A</div>')
      expect(out).not.toContain('<div>B</div>')

      // Release B; it (and the closing markup) must arrive after A, in order.
      releaseB()
      for (; ;) {
        const { done, value } = await reader.read()
        if (done) break
        out += decoder.decode(value, { stream: true })
      }
      expect(out).toContain('<div>B</div>')
      expect(out.indexOf('<div>A</div>')).toBeLessThan(out.indexOf('<div>B</div>'))
    })

    it('propagates errors from the React stream', async () => {
      const { service } = createService()
      const failing = new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new Error('boom')) },
      })
      await expect(readAll(service.renderStream(page, [], failing))).rejects.toThrow('boom')
    })
  })

  describe('renderClientOnly', () => {
    it('emits an empty #app div with the page JSON', () => {
      const { service } = createService()
      const html = service.renderClientOnly(page, [])
      expect(html).toContain('<script data-page="app" type="application/json">')
      expect(html).toContain('<div id="app"></div>')
      expect(html).not.toContain('data-server-rendered')
      expect(html).not.toContain('@inertia')
    })
  })

  it('resolves @viteHead and @viteScripts from the manifest in production', async () => {
    vi.stubEnv('DEV', false)
    ;(globalThis as ManifestGlobal).__STRATAL_INERTIA_MANIFEST__ = {
      'src/inertia/app.tsx': {
        file: 'assets/app-abc.js',
        css: ['assets/app-abc.css'],
        isEntry: true,
      },
    }
    const { service } = createService()
    const html = await readAll(service.renderStream(page, [], streamOf('<main/>')))
    expect(html).toContain('<link rel="stylesheet" href="/assets/app-abc.css" />')
    expect(html).toContain('<script type="module" src="/assets/app-abc.js"></script>')
  })
})
