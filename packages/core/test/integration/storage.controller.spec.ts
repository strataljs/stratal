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
      .withEnv({ APP_SECRET: TEST_SECRET } as Record<string, unknown>)
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
