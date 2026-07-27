import { Hono } from 'hono'
import { createMock } from '@stratal/testing/mocks'
import { describe, expect, it } from 'vitest'
import type { ZodType } from '../../i18n/validation/zod'
import { number, object, string } from 'zod/mini'
import type { LoggerService } from '../../logger/services/logger.service'
import type { ModuleRegistry } from '../../module/module-registry'
import { ResponseValidationError } from '../errors'
import type { HonoApp } from '../hono-app'
import { RouteMetadataRegistry } from '../route-metadata'
import { RouteRegistry } from '../route-registry'
import type { LocalePathService } from '../services/locale-path.service'
import { RouteRegistrationService } from '../services/route-registration.service'
import type { VersioningService } from '../services/versioning.service'
import type { RouteConfig, RouterEnv } from '../types'

const mockLogger = createMock<LoggerService>()

const mockVersioningService = {
  enabled: false,
  resolve: (path: string) => [path],
} as unknown as VersioningService

const mockLocalePathService = {
  enabled: false,
  localePathConfig: null,
  resolve: (path: string) => [{ path, isLocaleVariant: false }],
} as unknown as LocalePathService

const mockApp = new Hono<RouterEnv>() as unknown as HonoApp
const mockModuleRegistry = { getAllControllers: () => [] } as unknown as ModuleRegistry

interface RouteRegistrationServicePrivate {
  extractResponseSchema(routeConfig: RouteConfig): ZodType | null
  validateResponse(response: Response, schema: ZodType): Promise<Response>
}

const createService = () => {
  const service = new RouteRegistrationService(
    mockLogger,
    new RouteRegistry(mockVersioningService, mockLocalePathService),
    null,
    mockLocalePathService,
    mockApp,
    mockModuleRegistry,
    new RouteMetadataRegistry(),
  )
  return service as unknown as RouteRegistrationServicePrivate
}

const testSchema = object({ name: string() })

describe('Response Validation', () => {
  describe('extractResponseSchema', () => {
    it('should extract schema from bare ZodType response', () => {
      const service = createService()
      const schema = service.extractResponseSchema({ response: testSchema })

      expect(schema).toBe(testSchema)
    })

    it('should extract schema from RouteResponseObject with default content type', () => {
      const service = createService()
      const schema = service.extractResponseSchema({
        response: { schema: testSchema, description: 'Success' },
      })

      expect(schema).toBe(testSchema)
    })

    it('should extract schema from RouteResponseObject with explicit JSON content type', () => {
      const service = createService()
      const schema = service.extractResponseSchema({
        response: { schema: testSchema, contentType: 'application/json' },
      })

      expect(schema).toBe(testSchema)
    })

    it('should return null for non-JSON content type', () => {
      const service = createService()
      const schema = service.extractResponseSchema({
        response: { schema: testSchema, contentType: 'application/octet-stream' },
      })

      expect(schema).toBeNull()
    })

    it('should return null for text content type', () => {
      const service = createService()
      const schema = service.extractResponseSchema({
        response: { schema: testSchema, contentType: 'text/html' },
      })

      expect(schema).toBeNull()
    })
  })

  describe('validateResponse', () => {
    it('should pass through a valid JSON response', async () => {
      const service = createService()
      const response = new Response(JSON.stringify({ name: 'test' }), {
        headers: { 'content-type': 'application/json' },
      })

      const result = await service.validateResponse(response, testSchema)

      expect(result).toBe(response)
    })

    it('should throw ResponseValidationError for invalid JSON response', async () => {
      const service = createService()
      const response = new Response(JSON.stringify({ name: 123 }), {
        headers: { 'content-type': 'application/json' },
      })

      await expect(service.validateResponse(response, testSchema))
        .rejects.toThrow(ResponseValidationError)
    })

    it('should include issues in the error', async () => {
      const service = createService()
      const response = new Response(JSON.stringify({ name: 123 }), {
        headers: { 'content-type': 'application/json' },
      })

      try {
        await service.validateResponse(response, testSchema)
        expect.unreachable('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ResponseValidationError)
        const error = err as ResponseValidationError
        expect(error.issues).toBeDefined()
        expect(error.issues).toBeInstanceOf(Array)
        expect(error.issues.length).toBeGreaterThan(0)
        expect(error.issues[0]).toHaveProperty('path')
        expect(error.issues[0]).toHaveProperty('message')
        expect(error.issues[0]).toHaveProperty('code')
      }
    })

    it('should skip validation for non-JSON content type', async () => {
      const service = createService()
      const response = new Response('plain text', {
        headers: { 'content-type': 'text/plain' },
      })

      const result = await service.validateResponse(response, testSchema)

      expect(result).toBe(response)
    })

    it('should skip validation when content-type is missing', async () => {
      const service = createService()
      const response = new Response('no content type')

      const result = await service.validateResponse(response, testSchema)

      expect(result).toBe(response)
    })

    it('should skip validation for 204 No Content', async () => {
      const service = createService()
      const response = new Response(null, {
        status: 204,
        headers: { 'content-type': 'application/json' },
      })

      const result = await service.validateResponse(response, testSchema)

      expect(result).toBe(response)
    })

    it('should skip validation for 304 Not Modified', async () => {
      const service = createService()
      const response = new Response(null, {
        status: 304,
        headers: { 'content-type': 'application/json' },
      })

      const result = await service.validateResponse(response, testSchema)

      expect(result).toBe(response)
    })

    it('should skip validation when body is not valid JSON', async () => {
      const service = createService()
      const response = new Response('not json', {
        headers: { 'content-type': 'application/json' },
      })

      const result = await service.validateResponse(response, testSchema)

      expect(result).toBe(response)
    })

    it('should validate response with application/json; charset=utf-8', async () => {
      const service = createService()
      const response = new Response(JSON.stringify({ name: 123 }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })

      await expect(service.validateResponse(response, testSchema))
        .rejects.toThrow(ResponseValidationError)
    })

    it('should not consume the original response body', async () => {
      const service = createService()
      const data = { name: 'test' }
      const response = new Response(JSON.stringify(data), {
        headers: { 'content-type': 'application/json' },
      })

      const result = await service.validateResponse(response, testSchema)

      const body = await result.json()
      expect(body).toEqual(data)
    })
  })

  describe('ResponseValidationError', () => {
    it('should have httpStatus 500', () => {
      const zodResult = testSchema.safeParse({ name: 123 })
      expect(zodResult.success).toBe(false)
      if (zodResult.success) return

      const error = new ResponseValidationError(zodResult.error)
      expect(error.httpStatus).toBe(500)
    })

    it('should have the correct message', () => {
      const zodResult = testSchema.safeParse({ name: 123 })
      if (zodResult.success) return

      const error = new ResponseValidationError(zodResult.error)
      expect(error.message).toBe('Response validation failed')
    })

    it('should map ZodError issues to the issues property', () => {
      const schema = object({
        name: string(),
        age: number(),
      })
      const zodResult = schema.safeParse({ name: 123, age: 'not a number' })
      if (zodResult.success) return

      const error = new ResponseValidationError(zodResult.error)
      expect(error.issues).toHaveLength(2)
      expect(error.issues[0].path).toBe('name')
      expect(error.issues[1].path).toBe('age')
    })
  })
})
