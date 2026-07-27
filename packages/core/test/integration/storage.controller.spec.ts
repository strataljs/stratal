import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Module } from '../../src/module/module.decorator'
import { type RouteConfigurable, type Router } from '../../src/router/router'
import { VerifySignatureMiddleware } from '../../src/router/middleware/verify-signature.middleware'
import { signUrl } from '../../src/router/signed-url'
import { StorageController } from '../../src/storage/controllers/storage.controller'
import { StorageModule } from '../../src/storage/storage.module'

const DISK = 'uploads'
const FILE_PATH = 'documents/report.pdf'
const FILE_CONTENT = new TextEncoder().encode('fake file content')
const TEST_SECRET = 'test-app-secret'

@Module({
  imports: [
    StorageModule.forRoot({
      storage: [{ disk: DISK, binding: 'TEST_BUCKET', root: 'uploads' }],
      defaultStorageDisk: DISK,
      presignedUrl: { defaultExpiry: 3600, maxExpiry: 86400 },
    }),
  ],
  providers: [VerifySignatureMiddleware],
  controllers: [StorageController],
})
class StorageTestModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.middleware(VerifySignatureMiddleware)
  }
}

async function signedUrl(path: string): Promise<string> {
  return signUrl(`http://localhost${path}`, TEST_SECRET)
}

describe('StorageController', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [StorageTestModule],
    })
      .withEnv({ APP_SECRET: TEST_SECRET })
      .compile()
  })

  beforeEach(() => {
    module.storage.clear()
  })

  afterAll(async () => {
    await module.close()
  })

  describe('signature verification', () => {
    it('should reject unsigned requests with 403', async () => {
      const response = await module.http
        .get(`/storage/${DISK}/${FILE_PATH}`)
        .send()

      response.assertForbidden()
    })
  })

  describe('GET /storage/:disk/*', () => {
    it('should download a file with correct headers', async () => {
      await module.storage.upload(FILE_CONTENT, FILE_PATH, {
        size: FILE_CONTENT.length,
        mimeType: 'application/pdf',
      })

      const url = await signedUrl(`/storage/${DISK}/${FILE_PATH}`)
      const response = await module.fetch(new Request(url))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/pdf')
      expect(response.headers.get('content-length')).toBe(String(FILE_CONTENT.length))
      expect(response.headers.get('content-disposition')).toBe('inline')

      const body = await response.arrayBuffer()
      expect(new Uint8Array(body)).toEqual(FILE_CONTENT)
    })

    it('should send hardening headers on an inline response', async () => {
      await module.storage.upload(FILE_CONTENT, FILE_PATH, {
        size: FILE_CONTENT.length,
        mimeType: 'application/pdf',
      })

      const url = await signedUrl(`/storage/${DISK}/${FILE_PATH}`)
      const response = await module.fetch(new Request(url))

      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('content-security-policy')).toContain('sandbox')
    })

    // Objects are served from the application's own origin, so a response the browser renders as a
    // document executes in that origin's security context. A stored `text/html` object must come
    // back as an opaque download, never inline, or a bucket becomes a script-injection vector.
    it('should force a scriptable content type to download instead of rendering', async () => {
      const html = new TextEncoder().encode('<script>alert(1)</script>')
      await module.storage.upload(html, 'notes/page.html', {
        size: html.length,
        mimeType: 'text/html',
      })

      const url = await signedUrl(`/storage/${DISK}/notes/page.html`)
      const response = await module.fetch(new Request(url))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/octet-stream')
      expect(response.headers.get('content-disposition')).toBe('attachment; filename="page.html"')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    })

    // SVG is scriptable despite being an image, so it must not be on the inline allowlist.
    it('should not render SVG inline', async () => {
      const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
      await module.storage.upload(svg, 'images/logo.svg', {
        size: svg.length,
        mimeType: 'image/svg+xml',
      })

      const url = await signedUrl(`/storage/${DISK}/images/logo.svg`)
      const response = await module.fetch(new Request(url))

      expect(response.headers.get('content-type')).toBe('application/octet-stream')
      expect(response.headers.get('content-disposition')).toContain('attachment')
    })

    it('should render an allowlisted image inline', async () => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      await module.storage.upload(png, 'images/logo.png', {
        size: png.length,
        mimeType: 'image/png',
      })

      const url = await signedUrl(`/storage/${DISK}/images/logo.png`)
      const response = await module.fetch(new Request(url))

      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('content-disposition')).toBe('inline')
    })

    it('should honour a content type that carries parameters', async () => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      await module.storage.upload(png, 'images/param.png', {
        size: png.length,
        mimeType: 'image/png; charset=binary',
      })

      const url = await signedUrl(`/storage/${DISK}/images/param.png`)
      const response = await module.fetch(new Request(url))

      expect(response.headers.get('content-disposition')).toBe('inline')
    })

    // `url.pathname` is percent-encoded but keys are stored raw, so without decoding any key
    // holding a space, a non-ASCII character, `#` or `?` — most user-supplied filenames — was
    // looked up with the escapes intact and reported as missing.
    it('should serve a key containing characters the URL escapes', async () => {
      const content = new TextEncoder().encode('data')
      await module.storage.upload(content, 'exports/my report é.pdf', {
        size: content.length,
        mimeType: 'application/pdf',
      })

      const url = await signedUrl(`/storage/${DISK}/exports/my report é.pdf`)
      const response = await module.fetch(new Request(url))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-disposition')).toBe('inline')
    })

    // RFC 7230 §3.2 limits a header value to visible ASCII, space, tab and obs-text. A key holding
    // a control byte would otherwise emit a malformed `Content-Disposition` that a strict parser or
    // intermediary may reject — so the whole C0 range and DEL are stripped, not just CR/LF.
    it('should strip control characters from the download filename', async () => {
      const content = new TextEncoder().encode('data')
      const hostileKey = 'exports/re\u0000port\u0007.bin'
      await module.storage.upload(content, hostileKey, {
        size: content.length,
        mimeType: 'application/octet-stream',
      })

      const url = await signedUrl(`/storage/${DISK}/${hostileKey}`)
      const response = await module.fetch(new Request(url))

      const disposition = response.headers.get('content-disposition') ?? ''
      let hasControlByte = false
      for (let i = 0; i < disposition.length; i++) {
        const code = disposition.charCodeAt(i)
        if (code <= 0x1f || code === 0x7f) {
          hasControlByte = true
          break
        }
      }

      expect(response.status).toBe(200)
      expect(hasControlByte).toBe(false)
      // The legible part of the name survives; only the illegal bytes are dropped.
      expect(disposition).toBe('attachment; filename="report.bin"')
    })

    it('should return an error when file does not exist', async () => {
      const url = await signedUrl(`/storage/${DISK}/nonexistent/file.txt`)
      const response = await module.fetch(new Request(url))

      expect(response.status).toBe(404)
    })
  })

  describe('PUT /storage/:disk/*', () => {
    it('should upload a file and return path and disk', async () => {
      const content = new TextEncoder().encode('uploaded content')
      const url = await signedUrl(`/storage/${DISK}/${FILE_PATH}`)

      const response = await module.fetch(new Request(url, {
        method: 'PUT',
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(content.length),
        },
        body: content,
      }))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ path: FILE_PATH, disk: DISK })
    })

    it('should store the uploaded file', async () => {
      const content = new TextEncoder().encode('uploaded content')
      const url = await signedUrl(`/storage/${DISK}/${FILE_PATH}`)

      await module.fetch(new Request(url, {
        method: 'PUT',
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(content.length),
        },
        body: content,
      }))

      module.storage.assertExists(FILE_PATH)
    })
  })

  describe('DELETE /storage/:disk/*', () => {
    it('should delete a file and return 204', async () => {
      await module.storage.upload(FILE_CONTENT, FILE_PATH, {
        size: FILE_CONTENT.length,
        mimeType: 'application/pdf',
      })

      const url = await signedUrl(`/storage/${DISK}/${FILE_PATH}`)
      const response = await module.fetch(new Request(url, { method: 'DELETE' }))

      expect(response.status).toBe(204)
    })

    it('should remove the file from storage', async () => {
      await module.storage.upload(FILE_CONTENT, FILE_PATH, {
        size: FILE_CONTENT.length,
        mimeType: 'application/pdf',
      })

      const url = await signedUrl(`/storage/${DISK}/${FILE_PATH}`)
      await module.fetch(new Request(url, { method: 'DELETE' }))

      module.storage.assertMissing(FILE_PATH)
    })
  })
})
