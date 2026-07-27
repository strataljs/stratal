import { createMock } from '@stratal/testing/mocks'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { object, string } from 'zod/mini'
import type { ZodType } from '../../i18n/validation/zod'
import type { LoggerService } from '../../logger/services/logger.service'
import type { ModuleRegistry } from '../../module/module-registry'
import { generateOpenAPIDocument } from '../../openapi/openapi-generator'
import { DEFAULT_CONTENT_TYPE } from '../constants'
import type { HonoApp } from '../hono-app'
import { RouteMetadataRegistry, type RouteSchemaMeta } from '../route-metadata'
import { RouteRegistry } from '../route-registry'
import { RouteRegistrationService } from '../services/route-registration.service'
import type { LocalePathService } from '../services/locale-path.service'
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
  resolveBody(routeConfig: RouteConfig): { schema: ZodType; contentType: string } | undefined
  buildRouteMetadata(input: {
    method: string
    path: string
    routeConfig: RouteConfig
    metadata: { tags: string[]; security: Record<string, string[]>[]; groups: string[] }
    body?: { schema: ZodType; contentType: string }
    methodName?: string
    statusCodeOverride?: number
    isLocaleVariant?: boolean
    hidden?: boolean
  }): RouteSchemaMeta
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

const defaultMetadata = { tags: [], security: [], groups: [] }
const testSchema = object({ name: string() })

const metadataFor = (routeConfig: RouteConfig, method = 'post'): RouteSchemaMeta => {
  const service = createService()
  return service.buildRouteMetadata({
    method,
    path: '/test',
    routeConfig,
    metadata: defaultMetadata,
    body: service.resolveBody(routeConfig),
  })
}

describe('Content Type Support', () => {
  describe('request body', () => {
    it('should default to application/json for bare ZodType body', () => {
      expect(metadataFor({ body: testSchema, response: testSchema }).request.body?.contentType).toBe(DEFAULT_CONTENT_TYPE)
    })

    it('should use custom contentType for body object form', () => {
      const body = metadataFor({ body: { schema: testSchema, contentType: 'multipart/form-data' }, response: testSchema }).request.body
      expect(body?.contentType).toBe('multipart/form-data')
    })

    it('should default to application/json when body object omits contentType', () => {
      expect(metadataFor({ body: { schema: testSchema }, response: testSchema }).request.body?.contentType).toBe(DEFAULT_CONTENT_TYPE)
    })
  })

  describe('response', () => {
    it('should default to application/json for bare ZodType response', () => {
      const meta = metadataFor({ response: testSchema }, 'get')
      expect(meta.responses[0].contentType).toBe(DEFAULT_CONTENT_TYPE)
    })

    it('should use custom contentType for response object form', () => {
      const meta = metadataFor({ response: { schema: testSchema, contentType: 'application/octet-stream' } }, 'get')
      expect(meta.responses[0].contentType).toBe('application/octet-stream')
    })

    it('should default to application/json when response object omits contentType', () => {
      const meta = metadataFor({ response: { schema: testSchema, description: 'File' } }, 'get')
      expect(meta.responses[0].contentType).toBe(DEFAULT_CONTENT_TYPE)
    })
  })

  describe('generated document', () => {
    it('should emit the declared content types and keep custom-content-type routes intact', () => {
      const route = metadataFor({
        body: { schema: testSchema, contentType: 'multipart/form-data' },
        response: { schema: testSchema, contentType: 'application/octet-stream' },
      })
      const doc = generateOpenAPIDocument({ info: { title: 'API', version: '1.0.0' }, routes: [route] })
      const op = doc.paths['/test'].post!
      expect(op.requestBody && 'content' in op.requestBody && op.requestBody.content).toHaveProperty('multipart/form-data')
      expect((op.responses['200'] as { content: Record<string, unknown> }).content).toHaveProperty('application/octet-stream')
    })
  })
})
