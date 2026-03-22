import { type OpenAPIObject } from "../../i18n/validation"
import type { HttpMethod } from '../../router/types'

type JsonSchema = Record<string, unknown>

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: JsonSchema
  method: string
  path: string
  pathParams: string[]
}

export interface ToolExecutionResult {
  status: number
  body: string
  headers: Record<string, string>
}

export interface ToolFilter {
  tags?: string[]
  pathPrefix?: string
}

export type Dispatcher = (method: string, url: string, options?: {
  body?: unknown
  headers?: Record<string, string>
}) => Promise<Response>

interface OperationObject {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: ParameterObject[]
  requestBody?: RequestBodyObject
}

interface ParameterObject {
  name: string
  in: string
  required?: boolean
  schema?: JsonSchema
  description?: string
}

interface RequestBodyObject {
  required?: boolean
  content?: Record<string, { schema?: JsonSchema }>
}

/**
 * Converts an OpenAPI 3.0 spec into callable tool definitions.
 *
 * Plain class (no DI) — reusable across MCP, CLI, and custom tooling.
 */
export class OpenApiToolsService {
  private static readonly HTTP_METHODS: Set<string> = new Set<HttpMethod>(['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'])

  private tools: ToolDefinition[] = []
  private toolMap = new Map<string, ToolDefinition>()
  private dispatcher?: Dispatcher

  private spec: OpenAPIObject

  constructor(spec: OpenAPIObject, options?: { dispatcher?: Dispatcher }) {
    this.spec = spec
    this.dispatcher = options?.dispatcher
    this.tools = this.buildTools()
    for (const tool of this.tools) {
      this.toolMap.set(tool.name, tool)
    }
  }

  getTools(filter?: ToolFilter): ToolDefinition[] {
    let tools = this.tools

    if (filter?.tags?.length) {
      const tagSet = new Set(filter.tags)
      tools = tools.filter((t) => {
        const op = this.getOperation(t.method, t.path)
        return op?.tags?.some((tag) => tagSet.has(tag)) ?? false
      })
    }

    if (filter?.pathPrefix) {
      const prefix = filter.pathPrefix
      tools = tools.filter((t) => t.path.startsWith(prefix))
    }

    return tools
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.toolMap.get(name)
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const tool = this.toolMap.get(name)
    if (!tool) {
      throw new Error(`Tool not found: ${name}`)
    }
    if (!this.dispatcher) {
      throw new Error('No dispatcher configured')
    }

    // Interpolate path params
    let url = tool.path
    for (const param of tool.pathParams) {
      const value = args[`path_${param}`]
      if (value === undefined) {
        throw new Error(`Missing required path parameter: ${param}`)
      }
      url = url.replace(`{${param}}`, encodeURIComponent(value != null && typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean)))
    }

    // Collect query params
    const queryParts: string[] = []
    for (const key of Object.keys(args)) {
      if (key.startsWith('query_')) {
        const paramName = key.slice(6)
        const value = args[key]
        queryParts.push(`${encodeURIComponent(paramName)}=${encodeURIComponent(value != null && typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean))}`)
      }
    }
    if (queryParts.length > 0) {
      url += `?${queryParts.join('&')}`
    }

    const body = args.body
    const response = await this.dispatcher(
      tool.method.toUpperCase(),
      url,
      body !== undefined ? { body } : undefined,
    )

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return {
      status: response.status,
      body: await response.text(),
      headers: responseHeaders,
    }
  }

  private buildTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = []
    const paths = this.spec.paths

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!operation || typeof operation !== 'object') continue
        if (!OpenApiToolsService.HTTP_METHODS.has(method.toLowerCase())) continue

        const op = operation as OperationObject
        const name = op.operationId ?? this.generateName(method, path)
        const description = this.buildDescription(op, method, path)
        const { schema, pathParams } = this.buildInputSchema(op, method)

        tools.push({ name, description, inputSchema: schema, method: method.toUpperCase(), path, pathParams })
      }
    }

    return tools
  }

  private generateName(method: string, path: string): string {
    const snake = path
      .replace(/[{}]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase()
    return `${method.toLowerCase()}_${snake}`
  }

  private buildDescription(op: OperationObject, method: string, path: string): string {
    if (op.summary && op.description) {
      return `${op.summary} — ${op.description}`
    }
    return op.summary ?? op.description ?? `${method.toUpperCase()} ${path}`
  }

  private buildInputSchema(op: OperationObject, method: string): { schema: JsonSchema; pathParams: string[] } {
    const properties: Record<string, JsonSchema> = {}
    const required: string[] = []
    const pathParams: string[] = []

    // Parameters (path + query)
    for (const param of op.parameters ?? []) {
      const resolvedParam = this.resolveRef(param) as ParameterObject
      const paramSchema = resolvedParam.schema ? this.resolveRef(resolvedParam.schema) as JsonSchema : { type: 'string' }

      if (resolvedParam.in === 'path') {
        pathParams.push(resolvedParam.name)
        const key = `path_${resolvedParam.name}`
        properties[key] = { ...paramSchema }
        if (resolvedParam.description) properties[key].description = resolvedParam.description
        required.push(key)
      } else if (resolvedParam.in === 'query') {
        const key = `query_${resolvedParam.name}`
        properties[key] = { ...paramSchema }
        if (resolvedParam.description) properties[key].description = resolvedParam.description
        if (resolvedParam.required) required.push(key)
      }
    }

    // Request body
    const resolvedBody = op.requestBody ? this.resolveRef(op.requestBody) as RequestBodyObject : undefined
    if (resolvedBody) {
      const jsonContent = resolvedBody.content?.['application/json']
      if (jsonContent?.schema) {
        properties.body = this.resolveRef(jsonContent.schema) as JsonSchema
      } else {
        properties.body = { type: 'object' }
      }
      const needsBody = resolvedBody.required ?? ['post', 'put', 'patch'].includes(method.toLowerCase())
      if (needsBody) {
        required.push('body')
      }
    }

    const schema: JsonSchema = { type: 'object', properties }
    if (required.length > 0) {
      schema.required = required
    }

    return { schema, pathParams }
  }

  private resolveRef(obj: unknown, seen = new Set<string>()): unknown {
    if (!obj || typeof obj !== 'object') return obj
    const record = obj as Record<string, unknown>

    if (typeof record.$ref === 'string') {
      const refPath = record.$ref
      if (seen.has(refPath)) return obj
      seen.add(refPath)

      const resolved = this.lookupRef(refPath)
      if (!resolved) return obj
      return this.resolveRef(resolved, seen)
    }

    // Recursively walk all properties and resolve nested $refs
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      if (Array.isArray(value)) {
        result[key] = value.map((item) => this.resolveRef(item, seen))
      } else if (value && typeof value === 'object') {
        result[key] = this.resolveRef(value, seen)
      } else {
        result[key] = value
      }
    }
    return result
  }

  private lookupRef(refPath: string): unknown {
    const components = this.spec.components as Record<string, Record<string, unknown>> | undefined
    if (!components) return undefined

    const match = /^#\/components\/(\w+)\/(.+)$/.exec(refPath)
    if (!match) return undefined

    const [, section, name] = match
    return components[section][name]
  }

  private getOperation(method: string, path: string): OperationObject | undefined {
    const paths = this.spec.paths as Record<string, Record<string, unknown>> | undefined
    return paths?.[path]?.[method.toLowerCase()] as OperationObject | undefined
  }
}
