import 'reflect-metadata'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { R2StorageProvider } from '../providers/r2-storage.provider'
import type { StorageEntry } from '../types'
import { StorageError } from '../storage.error'
import type { StratalEnv } from '../../env'

vi.mock('../../router/signed-url', () => ({
  signUrl: vi.fn().mockResolvedValue('/storage/test/files/doc.pdf?method=GET&expires=9999999999&signature=abc123'),
}))

const config: StorageEntry = {
  disk: 'test',
  binding: 'TEST_BUCKET',
  root: 'files',
}

describe('R2StorageProvider', () => {
  let bucket: DeepMocked<R2Bucket>
  let env: DeepMocked<StratalEnv>
  let provider: R2StorageProvider

  beforeEach(() => {
    vi.clearAllMocks()

    bucket = createMock<R2Bucket>()
    env = { APP_SECRET: 'test-secret-key' } as unknown as DeepMocked<StratalEnv>
    provider = new R2StorageProvider(config, bucket as unknown as R2Bucket, env as unknown as StratalEnv)
  })

  describe('upload', () => {
    it('should upload a file with metadata', async () => {
      bucket.put.mockResolvedValue(createMock<R2Object>())

      const body = new Uint8Array([1, 2, 3])
      const result = await provider.upload(body, 'files/doc.pdf', {
        size: 3,
        mimeType: 'application/pdf',
        metadata: { author: 'test' },
      })

      expect(bucket.put).toHaveBeenCalledWith('files/doc.pdf', body, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { author: 'test' },
      })
      expect(result.path).toBe('files/doc.pdf')
      expect(result.disk).toBe('test')
      expect(result.fullPath).toBe('files/doc.pdf')
      expect(result.size).toBe(3)
      expect(result.mimeType).toBe('application/pdf')
    })

    it('should convert tagging to customMetadata', async () => {
      bucket.put.mockResolvedValue(createMock<R2Object>())

      const body = new Uint8Array([1])
      await provider.upload(body, 'file.txt', {
        size: 1,
        mimeType: 'text/plain',
        tagging: 'Tus-Completed=true',
      })

      expect(bucket.put).toHaveBeenCalledWith('file.txt', body, {
        httpMetadata: { contentType: 'text/plain' },
        customMetadata: { 'x-tags': 'Tus-Completed=true' },
      })
    })
  })

  describe('download', () => {
    it('should download a file and map R2ObjectBody to DownloadResult', async () => {
      const mockBody = new ReadableStream()
      const mockObj = createMock<R2ObjectBody>({
        body: mockBody,
        size: 1024,
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { author: 'test' },
      })
      mockObj.text.mockResolvedValue('content')
      mockObj.bytes.mockResolvedValue(new Uint8Array([1, 2, 3]))
      bucket.get.mockResolvedValue(mockObj as unknown as R2ObjectBody)

      const result = await provider.download('files/doc.pdf')

      expect(result.contentType).toBe('application/pdf')
      expect(result.size).toBe(1024)
      expect(result.metadata).toEqual({ author: 'test' })
      expect(result.toStream()).toBe(mockBody)
    })

    it('should throw StorageError when object not found', async () => {
      bucket.get.mockResolvedValue(null as unknown as R2ObjectBody)

      await expect(provider.download('missing.txt')).rejects.toThrow(StorageError)
    })
  })

  describe('delete', () => {
    it('should delete a file', async () => {
      await provider.delete('files/doc.pdf')
      expect(bucket.delete).toHaveBeenCalledWith('files/doc.pdf')
    })
  })

  describe('exists', () => {
    it('should return true when file exists', async () => {
      bucket.head.mockResolvedValue(createMock<R2Object>({ size: 100 }))
      expect(await provider.exists('files/doc.pdf')).toBe(true)
    })

    it('should return false when file does not exist', async () => {
      bucket.head.mockResolvedValue(null as unknown as R2Object)
      expect(await provider.exists('missing.txt')).toBe(false)
    })
  })

  describe('getPresignedUrl', () => {
    it('should generate a signed URL using signUrl()', async () => {
      const result = await provider.getPresignedUrl('files/doc.pdf', 'GET', 3600)

      expect(result.url).toContain('/storage/test/')
      expect(result.expiresIn).toBe(3600)
      expect(result.method).toBe('GET')
      expect(result.expiresAt).toBeInstanceOf(Date)
    })

    it('should throw StorageError when APP_SECRET is missing', async () => {
      const providerWithoutSecret = new R2StorageProvider(
        config,
        bucket as unknown as R2Bucket,
        {} as unknown as StratalEnv
      )

      await expect(
        providerWithoutSecret.getPresignedUrl('file.txt', 'GET', 3600)
      ).rejects.toThrow(StorageError)
    })
  })

  describe('headObject', () => {
    it('should return object metadata', async () => {
      bucket.head.mockResolvedValue(createMock<R2Object>({
        size: 1024,
        httpMetadata: { contentType: 'image/png' },
        customMetadata: { key: 'value' },
      }))

      const result = await provider.headObject('image.png')

      expect(result).toEqual({
        size: 1024,
        contentType: 'image/png',
        metadata: { key: 'value' },
      })
    })

    it('should return null when object does not exist', async () => {
      bucket.head.mockResolvedValue(null as unknown as R2Object)
      expect(await provider.headObject('missing.txt')).toBeNull()
    })
  })

  describe('deleteObjects', () => {
    it('should batch delete objects', async () => {
      const keys = ['file1.txt', 'file2.txt', 'file3.txt']
      const result = await provider.deleteObjects(keys)

      expect(bucket.delete).toHaveBeenCalledWith(keys)
      expect(result.deleted).toBe(3)
      expect(result.errors).toEqual([])
    })

    it('should handle empty keys array', async () => {
      const result = await provider.deleteObjects([])

      expect(bucket.delete).not.toHaveBeenCalled()
      expect(result.deleted).toBe(0)
    })
  })

  describe('multipart operations', () => {
    it('should create a multipart upload with tracking object', async () => {
      const mockUpload = createMock<R2MultipartUpload>({
        uploadId: 'upload-123',
        key: 'large-file.zip',
      })
      bucket.createMultipartUpload.mockResolvedValue(mockUpload as unknown as R2MultipartUpload)
      bucket.put.mockResolvedValue(createMock<R2Object>())

      const result = await provider.createMultipartUpload('large-file.zip', {
        contentType: 'application/zip',
        metadata: { source: 'test' },
      })

      expect(bucket.createMultipartUpload).toHaveBeenCalledWith('large-file.zip', {
        httpMetadata: { contentType: 'application/zip', cacheControl: undefined },
        customMetadata: { source: 'test' },
      })
      // Should write tracking object
      expect(bucket.put).toHaveBeenCalledWith(
        '__multipart/upload-123.json',
        expect.stringContaining('"uploadId":"upload-123"'),
        { httpMetadata: { contentType: 'application/json' } }
      )
      expect(result.uploadId).toBe('upload-123')
      expect(result.key).toBe('large-file.zip')
    })

    it('should upload a part with tracking object', async () => {
      const mockUpload = createMock<R2MultipartUpload>()
      mockUpload.uploadPart.mockResolvedValue({ partNumber: 1, etag: '"etag1"' })
      bucket.resumeMultipartUpload.mockReturnValue(mockUpload as unknown as R2MultipartUpload)
      bucket.put.mockResolvedValue(createMock<R2Object>())

      const body = new Uint8Array([1, 2, 3])
      const result = await provider.uploadPart('file.zip', 'upload-123', 1, body)

      expect(bucket.resumeMultipartUpload).toHaveBeenCalledWith('file.zip', 'upload-123')
      // Should write part tracking object
      expect(bucket.put).toHaveBeenCalledWith(
        '__parts/upload-123/1',
        expect.stringContaining('"partNumber":1'),
        { httpMetadata: { contentType: 'application/json' } }
      )
      expect(result.etag).toBe('"etag1"')
      expect(result.partNumber).toBe(1)
    })

    it('should complete a multipart upload and cleanup tracking', async () => {
      const mockUpload = createMock<R2MultipartUpload>()
      mockUpload.complete.mockResolvedValue(createMock<R2Object>({ key: 'file.zip' }))
      bucket.resumeMultipartUpload.mockReturnValue(mockUpload as unknown as R2MultipartUpload)
      bucket.list.mockResolvedValue(createMock<R2Objects>({
        objects: [],
        truncated: false,
      }))

      const parts = [{ etag: '"etag1"', partNumber: 1 }]
      const result = await provider.completeMultipartUpload('file.zip', 'upload-123', parts)

      expect(result.key).toBe('file.zip')
      // Should cleanup tracking objects
      expect(bucket.delete).toHaveBeenCalledWith(['__multipart/upload-123.json'])
    })

    it('should abort a multipart upload and cleanup tracking', async () => {
      const mockUpload = createMock<R2MultipartUpload>()
      bucket.resumeMultipartUpload.mockReturnValue(mockUpload as unknown as R2MultipartUpload)
      bucket.list.mockResolvedValue(createMock<R2Objects>({
        objects: [createMock<R2Object>({ key: '__parts/upload-123/1' })],
        truncated: false,
      }))

      await provider.abortMultipartUpload('file.zip', 'upload-123')

      expect(mockUpload.abort).toHaveBeenCalled()
      expect(bucket.delete).toHaveBeenCalledWith([
        '__parts/upload-123/1',
        '__multipart/upload-123.json',
      ])
    })
  })

  describe('listParts', () => {
    it('should list parts from companion objects', async () => {
      const partObj1 = createMock<R2ObjectBody>()
      partObj1.text.mockResolvedValue(JSON.stringify({ partNumber: 1, etag: '"etag1"', size: 5242880 }))
      const partObj2 = createMock<R2ObjectBody>()
      partObj2.text.mockResolvedValue(JSON.stringify({ partNumber: 2, etag: '"etag2"', size: 1024 }))

      bucket.list.mockResolvedValue(createMock<R2Objects>({
        objects: [
          createMock<R2Object>({ key: '__parts/upload-123/1' }),
          createMock<R2Object>({ key: '__parts/upload-123/2' }),
        ],
        truncated: false,
      }))
      bucket.get
        .mockResolvedValueOnce(partObj1 as unknown as R2ObjectBody)
        .mockResolvedValueOnce(partObj2 as unknown as R2ObjectBody)

      const result = await provider.listParts('file.zip', 'upload-123')

      expect(result.parts).toHaveLength(2)
      expect(result.parts[0]).toEqual({ partNumber: 1, etag: '"etag1"', size: 5242880 })
      expect(result.parts[1]).toEqual({ partNumber: 2, etag: '"etag2"', size: 1024 })
      expect(result.isTruncated).toBe(false)
    })
  })

  describe('listMultipartUploads', () => {
    it('should list uploads from companion objects', async () => {
      const uploadObj = createMock<R2ObjectBody>()
      uploadObj.text.mockResolvedValue(JSON.stringify({
        key: 'file.zip',
        uploadId: 'upload-123',
        initiated: '2024-06-15T10:30:00.000Z',
      }))

      bucket.list.mockResolvedValue(createMock<R2Objects>({
        objects: [createMock<R2Object>({ key: '__multipart/upload-123.json' })],
        truncated: false,
      }))
      bucket.get.mockResolvedValue(uploadObj as unknown as R2ObjectBody)

      const result = await provider.listMultipartUploads()

      expect(result.uploads).toHaveLength(1)
      expect(result.uploads[0].key).toBe('file.zip')
      expect(result.uploads[0].uploadId).toBe('upload-123')
      expect(result.uploads[0].initiated?.toISOString()).toBe('2024-06-15T10:30:00.000Z')
      expect(result.isTruncated).toBe(false)
    })
  })

  describe('getBucket', () => {
    it('should return the binding name', () => {
      expect(provider.getBucket()).toBe('TEST_BUCKET')
    })
  })
})
