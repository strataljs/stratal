import { inject } from 'tsyringe'
import { z } from 'zod'
import type { Application } from '../../application'
import { DI_TOKENS } from '../../di/tokens'
import { OPENAPI_TOKENS } from '../../openapi/openapi.tokens'
import type { IOpenAPIConfigService } from '../../openapi/types'
import type { OpenAPIService } from '../../openapi/services/openapi.service'
import { OpenApiToolsService } from '../../openapi/services/openapi-tools.service'
import type { Dispatcher } from '../../openapi/services/openapi-tools.service'
import { Command } from '../command'

export class McpServeCommand extends Command {
  static command = 'mcp:serve {--url= : Base URL for external dispatch} {--header=* : Headers (Key:Value)} {--tag=* : Only expose routes with these OpenAPI tags} {--path= : Only expose routes matching this path prefix}'
  static description = 'Start an MCP stdio server exposing API routes as tools'

  constructor(
    @inject(DI_TOKENS.Application) private app: Application,
    @inject(OPENAPI_TOKENS.OpenAPIService) private openAPIService: OpenAPIService,
  ) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')

    const baseUrl = this.string('url')
    const headerArgs = this.array('header')
    const tags = this.array('tag')
    const pathPrefix = this.string('path')

    const headers: Record<string, string> = {}
    for (const h of headerArgs) {
      const colonIdx = h.indexOf(':')
      if (colonIdx > 0) {
        headers[h.slice(0, colonIdx).trim()] = h.slice(colonIdx + 1).trim()
      }
    }

    const spec = this.openAPIService.getSpec(this.app.hono, this.app.container)

    const dispatcher: Dispatcher = baseUrl
      ? async (method, url, opts) => {
        return fetch(`${baseUrl}${url}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
            ...opts?.headers,
          },
          body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
        })
      }
      : async (method, url, opts) => {
        const request = new Request(`http://localhost${url}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
            ...opts?.headers,
          },
          body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
        })
        return this.app.hono.fetch(request, this.app.env)
      }

    const service = new OpenApiToolsService(spec, { dispatcher })
    const filter = {
      tags: tags.length > 0 ? tags : undefined,
      pathPrefix: pathPrefix || undefined,
    }
    const tools = service.getTools(filter)

    const configService = this.app.container.resolve<IOpenAPIConfigService>(OPENAPI_TOKENS.ConfigService)
    const config = configService.getEffectiveConfig()

    const server = new McpServer({
      name: config.info.title,
      version: config.info.version,
    })

    // Register each tool
    for (const tool of tools) {
      const inputSchema = z.fromJSONSchema(tool.inputSchema)
      server.registerTool(tool.name, { description: tool.description, inputSchema }, async (args) => {
        const result = await service.executeTool(tool.name, args as Record<string, unknown>)
        return {
          content: [{ type: 'text' as const, text: `Status: ${result.status}\n\n${result.body}` }],
        }
      })
    }

    // Expose OpenAPI spec as a resource
    server.registerResource(
      'openapi-spec',
      'openapi://spec',
      { description: 'Full OpenAPI specification', mimeType: 'application/json' },
      () => ({
        contents: [{
          uri: 'openapi://spec',
          mimeType: 'application/json',
          text: JSON.stringify(spec, null, 2),
        }],
      }),
    )

    const transport = new StdioServerTransport()
    await server.connect(transport)

    // Write info to stderr (stdout is reserved for MCP JSON-RPC)
    process.stderr.write(`MCP server started with ${tools.length} tool(s)\n`)

    // Keep process alive until client disconnects
    await new Promise<void>((resolve) => {
      transport.onclose = resolve
    })

    return 0
  }
}
