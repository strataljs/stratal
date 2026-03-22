import { describe, expect, it, vi } from 'vitest'
import { type OpenAPIObject } from '../../../i18n/validation'
import { OpenApiToolsService } from '../openapi-tools.service'

const minimalSpec = {
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/api/v1/notes': {
      get: {
        operationId: 'listNotes',
        summary: 'List notes',
        description: 'Returns all notes',
        tags: ['notes'],
      },
      post: {
        operationId: 'createNote',
        summary: 'Create a note',
        tags: ['notes'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/notes/{id}': {
      get: {
        operationId: 'getNote',
        summary: 'Get a note',
        tags: ['notes'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
      },
    },
    '/api/v1/users': {
      get: {
        summary: 'List users',
        tags: ['users'],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
          { name: 'limit', in: 'query', required: true, schema: { type: 'integer' }, description: 'Max results' },
        ],
      },
    },
    '/api/v1/tags': {
      get: {
        tags: ['admin'],
      },
    },
  },
} as unknown as OpenAPIObject

describe('OpenApiToolsService', () => {
  describe('getTools', () => {
    it('should generate tools from all paths', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tools = service.getTools()
      expect(tools).toHaveLength(5)
    })

    it('should use operationId as tool name when available', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTool('listNotes')
      expect(tool).toBeDefined()
      expect(tool!.method).toBe('GET')
      expect(tool!.path).toBe('/api/v1/notes')
    })

    it('should fall back to method_path naming', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTools().find((t) => t.path === '/api/v1/users')
      expect(tool).toBeDefined()
      expect(tool!.name).toBe('get_api_v1_users')
    })

    it('should build description from summary and description', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTool('listNotes')
      expect(tool!.description).toBe('List notes — Returns all notes')
    })

    it('should fall back to summary only', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTool('createNote')
      expect(tool!.description).toBe('Create a note')
    })

    it('should fall back to METHOD /path when no summary or description', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTools().find((t) => t.path === '/api/v1/tags')
      expect(tool!.description).toBe('GET /api/v1/tags')
    })
  })

  describe('input schema', () => {
    it('should create path_* properties for path params (always required)', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTool('getNote')!
      expect(tool.inputSchema.properties).toHaveProperty('path_id')
      expect(tool.inputSchema.required).toContain('path_id')
      expect(tool.pathParams).toEqual(['id'])
    })

    it('should create query_* properties for query params', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTools().find((t) => t.path === '/api/v1/users')!
      const props = tool.inputSchema.properties as Record<string, Record<string, unknown>>
      expect(props).toHaveProperty('query_page')
      expect(props).toHaveProperty('query_limit')
      expect(props.query_limit.description).toBe('Max results')
      expect(tool.inputSchema.required).toContain('query_limit')
      expect(tool.inputSchema.required).not.toContain('query_page')
    })

    it('should create body property for POST with request body', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTool('createNote')!
      expect(tool.inputSchema.properties).toHaveProperty('body')
      expect(tool.inputSchema.required).toContain('body')
    })

    it('should create minimal schema for GET with no params', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tool = service.getTool('listNotes')!
      expect(tool.inputSchema).toEqual({ type: 'object', properties: {} })
    })
  })

  describe('HTTP method filtering', () => {
    it('should skip non-HTTP-method keys on path items', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/notes': {
            get: { operationId: 'listNotes', summary: 'List notes' },
            summary: 'Notes endpoint',
            description: 'Manages notes',
            parameters: [{ name: 'shared', in: 'query' }],
          },
        },
      } as unknown as OpenAPIObject

      const service = new OpenApiToolsService(spec)
      const tools = service.getTools()
      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe('listNotes')
    })
  })

  describe('$ref resolution', () => {
    it('should resolve $ref pointers to components.schemas', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/items': {
            post: {
              operationId: 'createItem',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CreateItem' },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            CreateItem: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
      }
      const service = new OpenApiToolsService(spec as unknown as OpenAPIObject)
      const tool = service.getTool('createItem')!
      const body = (tool.inputSchema.properties as Record<string, Record<string, unknown>>).body
      expect(body.type).toBe('object')
      expect(body.properties).toHaveProperty('name')
    })
  })

  describe('filtering', () => {
    it('should filter by tags', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tools = service.getTools({ tags: ['users'] })
      expect(tools).toHaveLength(1)
      expect(tools[0].path).toBe('/api/v1/users')
    })

    it('should filter by path prefix', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tools = service.getTools({ pathPrefix: '/api/v1/notes' })
      expect(tools).toHaveLength(3)
    })

    it('should combine tag and path filters', () => {
      const service = new OpenApiToolsService(minimalSpec)
      const tools = service.getTools({ tags: ['notes'], pathPrefix: '/api/v1/notes/' })
      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe('getNote')
    })
  })

  describe('executeTool', () => {
    it('should interpolate path params, build query string, and call dispatcher', async () => {
      const dispatcher = vi.fn().mockResolvedValue(
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/notes/{id}': {
            get: {
              operationId: 'getNote',
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'fields', in: 'query', schema: { type: 'string' } },
              ],
            },
          },
        },
      } as unknown as OpenAPIObject

      const service = new OpenApiToolsService(spec, { dispatcher })
      const result = await service.executeTool('getNote', {
        path_id: '123',
        query_fields: 'title,content',
      })

      expect(dispatcher).toHaveBeenCalledWith(
        'GET',
        '/api/notes/123?fields=title%2Ccontent',
        undefined,
      )
      expect(result.status).toBe(200)
      expect(result.body).toBe('{"ok":true}')
      expect(result.headers['content-type']).toBe('application/json')
    })

    it('should pass body for POST requests', async () => {
      const dispatcher = vi.fn().mockResolvedValue(new Response('created', { status: 201 }))

      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/notes': {
            post: {
              operationId: 'createNote',
              requestBody: {
                content: { 'application/json': { schema: { type: 'object' } } },
              },
            },
          },
        },
      } as unknown as OpenAPIObject

      const service = new OpenApiToolsService(spec, { dispatcher })
      await service.executeTool('createNote', { body: { title: 'Hello' } })

      expect(dispatcher).toHaveBeenCalledWith('POST', '/api/notes', { body: { title: 'Hello' } })
    })

    it('should throw when tool not found', async () => {
      const service = new OpenApiToolsService({ openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} } as unknown as OpenAPIObject, { dispatcher: vi.fn() })
      await expect(service.executeTool('missing', {})).rejects.toThrow('Tool not found: missing')
    })

    it('should throw when required path parameter is missing', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/notes/{id}': {
            get: {
              operationId: 'getNote',
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      } as unknown as OpenAPIObject

      const service = new OpenApiToolsService(spec, { dispatcher: vi.fn() })
      await expect(service.executeTool('getNote', {})).rejects.toThrow('Missing required path parameter: id')
    })

    it('should throw when no dispatcher configured', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: { '/test': { get: { operationId: 'test' } } },
      }
      const service = new OpenApiToolsService(spec as unknown as OpenAPIObject)
      await expect(service.executeTool('test', {})).rejects.toThrow('No dispatcher configured')
    })
  })
})
