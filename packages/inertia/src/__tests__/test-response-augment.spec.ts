import type { Page } from '@inertiajs/core'
import { TestResponse } from '@stratal/testing'
import { describe, expect, it } from 'vitest'
import '../testing'

function createInertiaResponse(overrides: Partial<Page> = {}): TestResponse {
  const page: Page = {
    component: 'Home',
    props: { errors: {} },
    url: '/',
    version: '1.0',
    flash: {},
    rememberedState: {},
    ...overrides,
  }

  const response = new Response(JSON.stringify(page), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-inertia': 'true',
    },
  })

  return new TestResponse(response)
}

describe('TestResponse Inertia Augmentation', () => {
  describe('assertInertia()', () => {
    it('should pass for a valid Inertia response', async () => {
      const response = createInertiaResponse()
      await response.assertInertia()
    })

    it('should call callback with the parsed page object', async () => {
      const response = createInertiaResponse({ component: 'Notes/Index' })

      await response.assertInertia((page) => {
        expect(page.component).toBe('Notes/Index')
        expect(page.url).toBe('/')
      })
    })
  })

  describe('assertInertiaComponent()', () => {
    it('should pass when component matches', async () => {
      const response = createInertiaResponse({ component: 'Notes/Show' })
      await response.assertInertiaComponent('Notes/Show')
    })
  })

  describe('assertInertiaProp()', () => {
    it('should pass for a top-level prop', async () => {
      const response = createInertiaResponse({
        props: { message: 'Hello', errors: {} },
      })
      await response.assertInertiaProp('message', 'Hello')
    })

    it('should pass for a nested dot-path prop', async () => {
      const response = createInertiaResponse({
        props: { user: { name: 'John', role: 'admin' }, errors: {} },
      })
      await response.assertInertiaProp('user.name', 'John')
    })
  })

  describe('assertInertiaPropExists()', () => {
    it('should pass when prop exists', async () => {
      const response = createInertiaResponse({
        props: { notes: [], errors: {} },
      })
      await response.assertInertiaPropExists('notes')
    })
  })

  describe('assertInertiaPropMissing()', () => {
    it('should pass when prop is absent', async () => {
      const response = createInertiaResponse({
        props: { errors: {} },
      })
      await response.assertInertiaPropMissing('secret')
    })
  })

  describe('assertInertiaUrl()', () => {
    it('should pass when URL matches', async () => {
      const response = createInertiaResponse({ url: '/notes' })
      await response.assertInertiaUrl('/notes')
    })
  })

  describe('assertInertiaVersion()', () => {
    it('should pass when version matches', async () => {
      const response = createInertiaResponse({ version: '2.0' })
      await response.assertInertiaVersion('2.0')
    })

    it('should pass when version is null', async () => {
      const response = createInertiaResponse({ version: null })
      await response.assertInertiaVersion(null)
    })
  })

  describe('assertInertiaFlash()', () => {
    it('should pass when flash key and value match', async () => {
      const response = createInertiaResponse({
        flash: { success: 'Note created' },
      })
      await response.assertInertiaFlash('success', 'Note created')
    })
  })

  describe('assertInertiaDeferredProp()', () => {
    it('should pass when prop is in the deferred group', async () => {
      const response = createInertiaResponse({
        deferredProps: { default: ['heavyData', 'analytics'] },
      })
      await response.assertInertiaDeferredProp('heavyData', 'default')
    })
  })

  describe('assertInertiaMergeProp()', () => {
    it('should pass when prop is in mergeProps', async () => {
      const response = createInertiaResponse({
        mergeProps: ['items', 'notifications'],
      })
      await response.assertInertiaMergeProp('items')
    })
  })

  describe('assertInertiaSharedProp()', () => {
    it('should pass when prop is in sharedProps', async () => {
      const response = createInertiaResponse({
        sharedProps: ['locale', 'translations'],
      })
      await response.assertInertiaSharedProp('locale')
    })
  })
})
