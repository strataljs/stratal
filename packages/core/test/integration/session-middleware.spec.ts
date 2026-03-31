import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { SessionMiddlewareAppModule } from '../fixtures/session-middleware.controller'

describe('Session Verification Middleware', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [SessionMiddlewareAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  describe('with no cookie', () => {
    it('continues to handler without error', async () => {
      const response = await module.http
        .get('/api/session-test')
        .send()

      response.assertOk()
      await response.assertJsonPath('ok', true)
      await response.assertJsonPath('userId', null)
    })
  })

  describe('with valid cookie', () => {
    it('populates userId and continues', async () => {
      const response = await module.http
        .get('/api/session-test')
        .withHeaders({ cookie: 'better-auth.session_token=valid-token' })
        .send()

      response.assertOk()
      await response.assertJsonPath('ok', true)
      await response.assertJsonPath('userId', 'user-123')
    })
  })

  describe('with invalid cookie', () => {
    it('does not throw MiddlewareNextCalledMultipleTimesError', async () => {
      const response = await module.http
        .get('/api/session-test')
        .withHeaders({ cookie: 'better-auth.session_token=invalid-token' })
        .send()

      response.assertOk()
      await response.assertJsonPath('ok', true)
      await response.assertJsonPath('userId', null)
    })
  })

  describe('with expired cookie', () => {
    it('does not throw MiddlewareNextCalledMultipleTimesError', async () => {
      const response = await module.http
        .get('/api/session-test')
        .withHeaders({ cookie: 'better-auth.session_token=expired-token' })
        .send()

      response.assertOk()
      await response.assertJsonPath('ok', true)
      await response.assertJsonPath('userId', null)
    })
  })

  describe('with malformed cookie header', () => {
    it('handles gracefully without error', async () => {
      const response = await module.http
        .get('/api/session-test')
        .withHeaders({ cookie: 'malformed=;;;garbage;better-auth.session_token=' })
        .send()

      response.assertOk()
      await response.assertJsonPath('ok', true)
    })
  })
})
