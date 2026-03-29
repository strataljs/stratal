import 'reflect-metadata'
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

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

  describe('getPresignedUrl', () => {
    it('should use the same client when url is not set', async () => {
      const mockGetSignedUrl = vi.mocked(getSignedUrl)
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/test-bucket/file.pdf?X-Amz-Signature=abc123')

      const provider = new S3StorageProvider(config)
      const result = await provider.getPresignedUrl('file.pdf', 'GET', 3600)

      expect(result.url).toBe('https://s3.example.com/test-bucket/file.pdf?X-Amz-Signature=abc123')
      // Presigning client should be the same as the API client
      expect((provider as any).presigningClient).toBe((provider as any).client)
    })

    it('should use a separate presigning client when url is set', async () => {
      const mockGetSignedUrl = vi.mocked(getSignedUrl)
      mockGetSignedUrl.mockResolvedValue('https://cdn.myapp.com/test-bucket/file.pdf?X-Amz-Signature=abc123')

      const provider = new S3StorageProvider({ ...config, url: 'https://cdn.myapp.com' })
      await provider.getPresignedUrl('file.pdf', 'GET', 3600)

      // Presigning client should be different from the API client
      expect((provider as any).presigningClient).not.toBe((provider as any).client)
      // getSignedUrl should receive the presigning client, not the API client
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        (provider as any).presigningClient,
        expect.anything(),
        { expiresIn: 3600 }
      )
    })
  })

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
