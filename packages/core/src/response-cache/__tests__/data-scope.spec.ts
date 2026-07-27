import { describe, expect, it, vi } from 'vitest'
import { capturePayload, needsPayloadCapture } from '../../router/services/capture-payload'
import { renderTags } from '../tag-template'

describe('needsPayloadCapture', () => {
  it('is false for a route with neither decorator', () => {
    expect(needsPayloadCapture(undefined, undefined)).toBe(false)
  })

  it('is true when the route is cacheable with a {data.*} tag', () => {
    expect(needsPayloadCapture({ ttl: 60, tags: ['p:{data.post.id}'] }, undefined)).toBe(true)
  })

  it('is true when the route purges with a {data.*} tag', () => {
    expect(needsPayloadCapture(undefined, { tags: ['p:{data.post.id}'] })).toBe(true)
  })

  it('is false when tags reference only request scopes', () => {
    expect(needsPayloadCapture({ ttl: 60, tags: ['p:{param.slug}'] }, undefined)).toBe(false)
  })

  it('is false for a cacheable route with no tags at all', () => {
    expect(needsPayloadCapture({ ttl: 60 }, undefined)).toBe(false)
  })
})

describe('capturePayload', () => {
  it('stores the parsed body for a JSON response', async () => {
    const set = vi.fn()
    const c = { get: () => undefined, set } as never
    await capturePayload(c, Response.json({ post: { id: 7 } }))
    expect(set).toHaveBeenCalledWith('responsePayload', { post: { id: 7 } })
  })

  it('leaves the response body readable afterwards', async () => {
    const c = { get: () => undefined, set: vi.fn() } as never
    const response = Response.json({ post: { id: 7 } })
    await capturePayload(c, response)
    await expect(response.json()).resolves.toEqual({ post: { id: 7 } })
  })

  it('parses every JSON-family content type', async () => {
    for (const type of [
      'application/json',
      'application/json; charset=utf-8',
      'application/problem+json',
      'application/ld+json',
      'application/vnd.api+json',
    ]) {
      const set = vi.fn()
      const c = { get: () => undefined, set } as never
      await capturePayload(c, new Response('{"id":1}', { headers: { 'Content-Type': type } }))
      expect(set, type).toHaveBeenCalledWith('responsePayload', { id: 1 })
    }
  })

  it('ignores a body it cannot structure, without preventing the response being cached', async () => {
    for (const type of ['text/html', 'image/png', 'text/plain', 'application/octet-stream']) {
      const set = vi.fn()
      const c = { get: () => undefined, set } as never
      await capturePayload(c, new Response('body', { headers: { 'Content-Type': type } }))
      expect(set, type).not.toHaveBeenCalled()
    }
  })

  it('does not overwrite a payload already set by Inertia', async () => {
    const set = vi.fn()
    const c = { get: () => ({ existing: true }), set } as never
    await capturePayload(c, Response.json({ post: { id: 7 } }))
    expect(set).not.toHaveBeenCalled()
  })

  it('swallows a malformed JSON body rather than failing the request', async () => {
    const set = vi.fn()
    const c = { get: () => undefined, set } as never
    const response = new Response('not json', { headers: { 'Content-Type': 'application/json' } })
    await expect(capturePayload(c, response)).resolves.toBeUndefined()
    expect(set).not.toHaveBeenCalled()
  })
})

describe('{data.*} scope end to end', () => {
  it('renders a tag from a captured nested payload value', () => {
    const scopes = { param: {}, query: {}, body: undefined, data: { post: { id: 7, categoryId: 42 } } }
    expect(renderTags(['cat:{data.post.categoryId}'], scopes)).toEqual(['cat:42'])
  })
})
