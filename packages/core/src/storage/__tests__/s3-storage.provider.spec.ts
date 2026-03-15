import { describe, expect, it, vi } from 'vitest'

// Mock AWS SDK before importing S3StorageProvider
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn()
  return {
    S3Client: class { send = mockSend },
    ListMultipartUploadsCommand: class { },
    // Stub other commands referenced by the module
    AbortMultipartUploadCommand: class { },
    CompleteMultipartUploadCommand: class { },
    CreateMultipartUploadCommand: class { },
    DeleteObjectCommand: class { },
    DeleteObjectsCommand: class { },
    GetObjectCommand: class { },
    HeadObjectCommand: class { },
    ListPartsCommand: class { },
    PutObjectCommand: class { },
    UploadPartCommand: class { },
  }
})

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class { },
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}))

import { S3StorageProvider } from '../providers/s3-storage.provider'
import type { StorageEntry } from '../types'

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

      // Create provider and override the send method on the client instance
      const provider = new S3StorageProvider(config)
        // Access the internal client and override send
        ; (provider as unknown as { client: { send: typeof mockSend } }).client.send = mockSend

      const result = await provider.listMultipartUploads()

      expect(result.uploads).toHaveLength(1)
      // toBe checks reference equality — ensures it's the S3 response date, not a new Date()
      expect(result.uploads[0].initiated).toBe(expectedDate)
      expect(result.uploads[0].initiated?.getTime()).toBe(new Date('2024-06-15T10:30:00Z').getTime())
    })
  })
})
