import { Test, type TestingModule } from '@stratal/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Module } from '../../src/module/module.decorator';
import {
    HttpMethodAppModule,
    MixedController,
} from '../fixtures/http-method.controller';

describe('HTTP Method Decorators', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [HttpMethodAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  describe('@Get', () => {
    it('GET / returns list', async () => {
      const response = await module.http
        .get('/api/http-methods')
        .send()

      response.assertOk()
      await response.assertJsonPathMatches(
        'items',
        (items) => Array.isArray(items) && items.length === 2 && items[0] === 'a' && items[1] === 'b',
      )
    })

    it('GET /:id returns item by id', async () => {
      const response = await module.http
        .get('/api/http-methods/abc')
        .send()

      response.assertOk()
      await response.assertJsonPath('id', 'abc')
    })
  })

  describe('@Post', () => {
    it('POST / creates item with 201 status code', async () => {
      const response = await module.http
        .post('/api/http-methods')
        .withBody({ name: 'test-item' })
        .send()

      response.assertCreated()
      await response.assertJsonPath('id', '1')
      await response.assertJsonPath('name', 'test-item')
    })

    it('POST / validates request body (missing required field)', async () => {
      const response = await module.http
        .post('/api/http-methods')
        .withBody({})
        .send()

      response.assertBadRequest()
    })

    it('POST / validates request body (empty string fails min(1))', async () => {
      const response = await module.http
        .post('/api/http-methods')
        .withBody({ name: '' })
        .send()

      response.assertBadRequest()
    })

    it('POST /:id/avatar handles custom nested path', async () => {
      const response = await module.http
        .post('/api/http-methods/42/avatar')
        .withBody({ url: 'https://example.com/avatar.png' })
        .send()

      response.assertCreated()
      await response.assertJsonPath('id', '42')
      await response.assertJsonPath('avatarUrl', 'https://example.com/avatar.png')
    })
  })

  describe('@Put', () => {
    it('PUT /:id updates item', async () => {
      const response = await module.http
        .put('/api/http-methods/99')
        .withBody({ name: 'updated' })
        .send()

      response.assertOk()
      await response.assertJsonPath('id', '99')
      await response.assertJsonPath('name', 'updated')
    })
  })

  describe('@Patch', () => {
    it('PATCH /:id patches item', async () => {
      const response = await module.http
        .patch('/api/http-methods/55')
        .withBody({ name: 'patched' })
        .send()

      response.assertOk()
      await response.assertJsonPath('id', '55')
      await response.assertJsonPath('name', 'patched')
    })

    it('PATCH /:id with empty body uses default', async () => {
      const response = await module.http
        .patch('/api/http-methods/55')
        .withBody({})
        .send()

      response.assertOk()
      await response.assertJsonPath('name', 'default')
    })
  })

  describe('@Delete', () => {
    it('DELETE /:id deletes item', async () => {
      const response = await module.http
        .delete('/api/http-methods/77')
        .send()

      response.assertOk()
      await response.assertJsonPath('deleted', true)
    })
  })

  describe('@Get with query params', () => {
    it('GET /search validates and passes query params', async () => {
      const response = await module.http
        .get('/api/http-methods/search?q=hello')
        .send()

      response.assertOk()
      await response.assertJsonPath('query', 'hello')
    })

    it('GET /search rejects missing required query param', async () => {
      const response = await module.http
        .get('/api/http-methods/search')
        .send()

      response.assertBadRequest()
    })
  })

  describe('@All', () => {
    it('matches GET requests', async () => {
      const response = await module.http
        .get('/api/catch-all/some/path')
        .send()

      response.assertOk()
      await response.assertJsonPath('method', 'GET')
    })

    it('matches POST requests', async () => {
      const response = await module.http
        .post('/api/catch-all/another/path')
        .withBody({})
        .send()

      response.assertOk()
      await response.assertJsonPath('method', 'POST')
    })

    it('matches PUT requests', async () => {
      const response = await module.http
        .put('/api/catch-all/yet/another')
        .withBody({})
        .send()

      response.assertOk()
      await response.assertJsonPath('method', 'PUT')
    })
  })

  describe('Controller options', () => {
    it('inherits tags from @Controller', async () => {
      const response = await module.http
        .get('/api/http-methods')
        .send()

      response.assertOk()
    })
  })

  describe('Mutual exclusivity', () => {
    it('throws RouterError when mixing @Route and HTTP method decorators', async () => {
      @Module({
        controllers: [MixedController],
      })
      class MixedAppModule {}

      const testModule = await Test.createTestingModule({
        imports: [MixedAppModule],
      }).compile()

      await expect(
        testModule.application.ensureHono()
      ).rejects.toMatchObject({
        name: 'RouterError',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message: expect.stringContaining('Cannot mix @Route() with HTTP method decorators'),
      })

      await testModule.close()
    })
  })
})
