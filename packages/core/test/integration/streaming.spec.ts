import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { StreamingAppModule } from '../fixtures/streaming.controller'

describe('Streaming', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [StreamingAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  describe('stream()', () => {
    it('should return a Response with a readable body', async () => {
      const response = await module.http.get('/streaming/stream').send()

      response.assertOk()

      const text = await response.raw.text()
      expect(text).toBe('Hello')
    })

    it('should invoke the error callback on stream error', async () => {
      const response = await module.http.get('/streaming/stream-error').send()

      const text = await response.raw.text()
      expect(text.includes('stream error')).toBe(true)
    })
  })

  describe('streamText()', () => {
    it('should set Content-Encoding to Identity', async () => {
      const response = await module.http.get('/streaming/text').send()

      response.assertHeader('Content-Encoding', 'Identity')
    })

    it('should stream text content', async () => {
      const response = await module.http.get('/streaming/text').send()

      const text = await response.raw.text()
      expect(text).toBe('hello world')
    })

    it('should set Content-Type to text/plain', async () => {
      const response = await module.http.get('/streaming/text').send()

      const contentType = response.headers.get('Content-Type') ?? ''
      expect(contentType.includes('text/plain')).toBe(true)
    })
  })

  describe('streamSSE()', () => {
    it('should set Content-Encoding to Identity', async () => {
      const sse = await module.sse('/streaming/sse').connect()
      expect(sse.raw.headers.get('Content-Encoding')).toBe('Identity')
      await sse.waitForEnd()
    })

    it('should produce SSE-formatted events', async () => {
      const sse = await module.sse('/streaming/sse').connect()
      await sse.assertEvent({ event: 'message', data: 'hello', id: '1' })
      await sse.waitForEnd()
    })

    it('should set Content-Type to text/event-stream', async () => {
      const sse = await module.sse('/streaming/sse').connect()
      const contentType = sse.raw.headers.get('Content-Type') ?? ''
      expect(contentType.includes('text/event-stream')).toBe(true)
      await sse.waitForEnd()
    })
  })
})
