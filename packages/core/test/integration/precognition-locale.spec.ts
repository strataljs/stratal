import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { PrecognitionAppModule } from '../fixtures/precognition.controller'

/**
 * Regression spec for a bug where per-field Precognition validation always
 * returned 204 success on **locale-prefixed** routes (`POST /pt/onboard/`)
 * regardless of body content, while the same route at its bare URL
 * (`POST /onboard/`) correctly returned 400 on invalid bodies.
 *
 * Cause: `HandlePrecognitiveRequests` middleware sets a 204 Response on
 * `c.set('validationSuccessResponse', ...)`. The `defaultHook` previously
 * consumed that override after the first successful validator. For locale
 * routes, `buildOpenAPIRoute` auto-injects a `locale` path-param validator
 * that runs before the body validator — its success returned the 204 before
 * body validation ever ran.
 *
 * Fix: `defaultHook` no longer touches the override; instead the controller
 * handler factory (`createControllerHandler`) returns the override at the
 * start of the controller body, AFTER all validators (and scoped middleware
 * + guards) have run.
 */
describe('Precognition on locale-prefixed routes', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [PrecognitionAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  describe('locale-prefixed URL (/pt/onboard)', () => {
    it('returns 204 when body validation passes', async () => {
      const response = await module.http
        .post('/pt/onboard')
        .withHeaders({ precognition: 'true' })
        .withBody({ name: 'Ada', email: 'ada@example.com' })
        .send()

      response.assertNoContent()
      response.assertHeader('Precognition-Success', 'true')
    })

    it('returns 400 when body validation fails (regression: was 204)', async () => {
      const response = await module.http
        .post('/pt/onboard')
        .withHeaders({ precognition: 'true' })
        .withBody({ name: '', email: 'not-an-email' })
        .send()

      response.assertBadRequest()
    })
  })

  describe('bare URL (/onboard) — parity check', () => {
    it('returns 204 when body validation passes', async () => {
      const response = await module.http
        .post('/onboard')
        .withHeaders({ precognition: 'true' })
        .withBody({ name: 'Ada', email: 'ada@example.com' })
        .send()

      response.assertNoContent()
      response.assertHeader('Precognition-Success', 'true')
    })

    it('returns 400 when body validation fails', async () => {
      const response = await module.http
        .post('/onboard')
        .withHeaders({ precognition: 'true' })
        .withBody({ name: '', email: 'not-an-email' })
        .send()

      response.assertBadRequest()
    })
  })

  describe('non-precognition requests', () => {
    it('runs the controller body when validation passes (no 204 short-circuit)', async () => {
      const response = await module.http
        .post('/pt/onboard')
        .withBody({ name: 'Ada', email: 'ada@example.com' })
        .send()

      response.assertOk()
      await response.assertJsonPath('ok', true)
    })
  })
})
