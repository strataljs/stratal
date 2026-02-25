import { describe, expect, it, vi } from 'vitest'

// Mock AWS SDK before importing S3StorageProvider
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn()
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    ListMultipartUploadsCommand: vi.fn(),
    // Stub other commands referenced by the module
    AbortMultipartUploadCommand: vi.fn(),
    CompleteMultipartUploadCommand: vi.fn(),
    CreateMultipartUploadCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    DeleteObjectsCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
    ListPartsCommand: vi.fn(),
    PutObjectCommand: vi.fn(),
    UploadPartCommand: vi.fn(),
  }
})

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn(),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}))

import { S3Client } from '@aws-sdk/client-s3'
import type { StorageEntry } from 'stratal'
import { S3StorageProvider } from '../providers/s3-storage.provider'

describe('S3StorageProvider', () => {
  const config: StorageEntry = {
    disk: 'test',
    provider: 's3',
    endpoint: 'https://s3.example.com',
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    root: '',
    visibility: 'private',
  }

  describe('listMultipartUploads', () => {
    it('should use Initiated date from S3 response, not current time', async () => {
      const expectedDate = new Date('2024-06-15T10:30:00Z')

      const mockSend = vi.fn().mockResolvedValue({
        Uploads: [
          {
            Key: 'test-file.txt',
            UploadId: 'upload-123',
            Initiated: expectedDate,
          },
        ],
        IsTruncated: false,
      })

      // Get the mock client instance and set its send method
      const provider = new S3StorageProvider(config)
      const clientInstance = (S3Client as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value
      clientInstance.send = mockSend

      const result = await provider.listMultipartUploads()

      expect(result.uploads).toHaveLength(1)
      // toBe checks reference equality — ensures it's the S3 response date, not a new Date()
      expect(result.uploads[0].initiated).toBe(expectedDate)
      expect(result.uploads[0].initiated?.getTime()).toBe(new Date('2024-06-15T10:30:00Z').getTime())
    })
  })
})
