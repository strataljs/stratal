import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { I18nAppModule } from '../fixtures/i18n-app.module'

describe('Localization Integration', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [I18nAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  describe('404 Route Not Found', () => {
    it('returns English message by default (no locale)', async () => {
      const response = await module.http
        .get('/api/nonexistent')
        .send()

      response.assertNotFound()
      await response.assertJsonPath('message', 'Route not found: GET /api/nonexistent')
    })

    it('returns English message with explicit locale: en', async () => {
      const response = await module.http
        .withLocale('en')
        .get('/api/nonexistent')
        .send()

      response.assertNotFound()
      await response.assertJsonPath('message', 'Route not found: GET /api/nonexistent')
    })

    it('returns French message with locale: fr', async () => {
      const response = await module.http
        .withLocale('fr')
        .get('/api/nonexistent')
        .send()

      response.assertNotFound()
      await response.assertJsonPath('message', 'Route introuvable : GET /api/nonexistent')
    })

    it('falls back to English for unsupported locale', async () => {
      const response = await module.http
        .withLocale('de')
        .get('/api/nonexistent')
        .send()

      response.assertNotFound()
      await response.assertJsonPath('message', 'Route not found: GET /api/nonexistent')
    })
  })

  describe('Schema Validation Errors', () => {
    it('returns French validation error with locale: fr (missing field)', async () => {
      const response = await module.http
        .withLocale('fr')
        .post('/api/bench/items')
        .withBody({})
        .send()

      response.assertBadRequest()
      await response.assertJsonPath('message', 'La validation du schéma a échoué')
      await response.assertJsonPathExists('metadata.issues')
      await response.assertJsonPathMatches(
        'metadata.issues',
        (issues) => Array.isArray(issues) && issues.length > 0,
      )
      await response.assertJsonPathMatches(
        'metadata.issues.0.message',
        (msg) => typeof msg === 'string' && msg === 'Requis',
      )
    })

    it('returns French validation error with locale: fr (empty string)', async () => {
      const response = await module.http
        .withLocale('fr')
        .post('/api/bench/items')
        .withBody({ name: '' })
        .send()

      response.assertBadRequest()
      await response.assertJsonPath('message', 'La validation du schéma a échoué')
      await response.assertJsonPathMatches(
        'metadata.issues.0.message',
        (msg) => typeof msg === 'string' && msg === 'Doit comporter au moins 1 caractères',
      )
    })

    it('returns English validation error with locale: en', async () => {
      const response = await module.http
        .withLocale('en')
        .post('/api/bench/items')
        .withBody({})
        .send()

      response.assertBadRequest()
      await response.assertJsonPath('message', 'Schema validation failed')
      await response.assertJsonPathMatches(
        'metadata.issues.0.message',
        (msg) => typeof msg === 'string' && msg === 'Required',
      )
    })
  })

  describe('Successful responses are unaffected by locale', () => {
    it('returns 200 with normal response for GET with locale: fr', async () => {
      const response = await module.http
        .withLocale('fr')
        .get('/api/bench')
        .send()

      response.assertOk()
      await response.assertJsonPath('ok', true)
    })

    it('returns 201 with normal response for valid POST with locale: fr', async () => {
      const response = await module.http
        .withLocale('fr')
        .post('/api/bench/items')
        .withBody({ name: 'test-item' })
        .send()

      response.assertCreated()
      await response.assertJsonPath('id', 'new-1')
      await response.assertJsonPath('name', 'bench-item')
    })
  })
})
