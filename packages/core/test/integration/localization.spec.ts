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
    it('returns English message by default (no header)', async () => {
      const response = await module.http
        .get('/api/nonexistent')
        .send()

      response.assertNotFound()
      await response.assertJsonPath('message', 'Route not found: GET /api/nonexistent')
    })

    it('returns English message with explicit x-locale: en', async () => {
      const response = await module.http
        .withHeaders({ 'x-locale': 'en' })
        .get('/api/nonexistent')
        .send()

      response.assertNotFound()
      await response.assertJsonPath('message', 'Route not found: GET /api/nonexistent')
    })

    it('returns French message with x-locale: fr', async () => {
      const response = await module.http
        .withHeaders({ 'x-locale': 'fr' })
        .get('/api/nonexistent')
        .send()

      response.assertNotFound()
      await response.assertJsonPath('message', 'Route introuvable : GET /api/nonexistent')
    })

    it('falls back to English for unsupported locale', async () => {
      const response = await module.http
        .withHeaders({ 'x-locale': 'de' })
        .get('/api/nonexistent')
        .send()

      response.assertNotFound()
      await response.assertJsonPath('message', 'Route not found: GET /api/nonexistent')
    })
  })

  describe('Schema Validation Errors', () => {
    it('returns French validation error with x-locale: fr (missing field)', async () => {
      const response = await module.http
        .withHeaders({ 'x-locale': 'fr' })
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

    it('returns French validation error with x-locale: fr (empty string)', async () => {
      const response = await module.http
        .withHeaders({ 'x-locale': 'fr' })
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

    it('returns English validation error with x-locale: en', async () => {
      const response = await module.http
        .withHeaders({ 'x-locale': 'en' })
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
    it('returns 200 with normal response for GET with x-locale: fr', async () => {
      const response = await module.http
        .withHeaders({ 'x-locale': 'fr' })
        .get('/api/bench')
        .send()

      response.assertOk()
      await response.assertJsonPath('ok', true)
    })

    it('returns 201 with normal response for valid POST with x-locale: fr', async () => {
      const response = await module.http
        .withHeaders({ 'x-locale': 'fr' })
        .post('/api/bench/items')
        .withBody({ name: 'test-item' })
        .send()

      response.assertCreated()
      await response.assertJsonPath('id', 'new-1')
      await response.assertJsonPath('name', 'bench-item')
    })
  })
})
