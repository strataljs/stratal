import { createMock } from '@stratal/testing/mocks'
import { describe, expect, it } from 'vitest'
import { z, type RouteConfig as OpenAPIRouteConfig } from '../../i18n/validation'
import type { LoggerService } from '../../logger/services/logger.service'
import { DEFAULT_CONTENT_TYPE } from '../constants'
import { RouteRegistrationService } from '../services/route-registration.service'
import type { RouteConfig } from '../types'

const mockLogger = createMock<LoggerService>()

interface RouteRegistrationServicePrivate {
  buildOpenAPIRoute(
    method: string,
    path: string,
    routeConfig: RouteConfig,
    metadata: { tags: string[]; security: Record<string, string[]>[] },
    guards: [],
    methodName?: string,
    statusCodeOverride?: number
  ): OpenAPIRouteConfig
}

const createService = () => {
  const service = new RouteRegistrationService(mockLogger as unknown as LoggerService, null)
  return service as unknown as RouteRegistrationServicePrivate
}

const defaultMetadata = { tags: [], security: [] }
const testSchema = z.object({ name: z.string() })

type AnyRecord = Record<string, unknown>

describe('Content Type Support', () => {
  describe('request body', () => {
    it('should default to application/json for bare ZodType body', () => {
      const service = createService()
      const route = service.buildOpenAPIRoute('post', '/test', {
        body: testSchema,
        response: testSchema,
      }, defaultMetadata, [])

      expect(route.request?.body?.content).toHaveProperty(DEFAULT_CONTENT_TYPE)
    })

    it('should use custom contentType for body object form', () => {
      const service = createService()
      const route = service.buildOpenAPIRoute('post', '/test', {
        body: { schema: testSchema, contentType: 'multipart/form-data' },
        response: testSchema,
      }, defaultMetadata, [])

      expect(route.request?.body?.content).toHaveProperty('multipart/form-data')
      expect(route.request?.body?.content).not.toHaveProperty(DEFAULT_CONTENT_TYPE)
    })

    it('should default to application/json when body object omits contentType', () => {
      const service = createService()
      const route = service.buildOpenAPIRoute('post', '/test', {
        body: { schema: testSchema },
        response: testSchema,
      }, defaultMetadata, [])

      expect(route.request?.body?.content).toHaveProperty(DEFAULT_CONTENT_TYPE)
    })
  })

  describe('response', () => {
    it('should default to application/json for bare ZodType response', () => {
      const service = createService()
      const route = service.buildOpenAPIRoute('get', '/test', {
        response: testSchema,
      }, defaultMetadata, [])

      const successResponse = (route.responses as AnyRecord)[200] as AnyRecord
      expect(successResponse.content).toHaveProperty(DEFAULT_CONTENT_TYPE)
    })

    it('should use custom contentType for response object form', () => {
      const service = createService()
      const route = service.buildOpenAPIRoute('get', '/test', {
        response: { schema: testSchema, contentType: 'application/octet-stream' },
      }, defaultMetadata, [])

      const successResponse = (route.responses as AnyRecord)[200] as AnyRecord
      expect(successResponse.content).toHaveProperty('application/octet-stream')
      expect(successResponse.content).not.toHaveProperty(DEFAULT_CONTENT_TYPE)
    })

    it('should default to application/json when response object omits contentType', () => {
      const service = createService()
      const route = service.buildOpenAPIRoute('get', '/test', {
        response: { schema: testSchema, description: 'File' },
      }, defaultMetadata, [])

      const successResponse = (route.responses as AnyRecord)[200] as AnyRecord
      expect(successResponse.content).toHaveProperty(DEFAULT_CONTENT_TYPE)
    })
  })

  describe('error schemas', () => {
    it('should keep error schemas as application/json regardless of route content type', () => {
      const service = createService()
      const route = service.buildOpenAPIRoute('post', '/test', {
        body: { schema: testSchema, contentType: 'multipart/form-data' },
        response: { schema: testSchema, contentType: 'application/octet-stream' },
      }, defaultMetadata, [])

      // Check that error responses (400, 401, etc.) still use application/json
      for (const status of [400, 401, 403, 404, 409, 500]) {
        const errorResponse = (route.responses as AnyRecord)[status] as AnyRecord | undefined
        if (errorResponse?.content) {
          expect(errorResponse.content).toHaveProperty(DEFAULT_CONTENT_TYPE)
        }
      }
    })
  })
})
