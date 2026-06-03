import { inject } from '../../di'
import type { Application } from '../../application'
import { DI_TOKENS } from '../../di/tokens'
import { OPENAPI_TOKENS } from '../../openapi/openapi.tokens'
import type { OpenAPIService } from '../../openapi/services/openapi.service'
import { OpenApiToolsService } from '../../openapi/services/openapi-tools.service'
import { Command } from '../command'

export class McpToolsCommand extends Command {
  static command = 'mcp:tools {--tag=* : Filter by OpenAPI tags} {--path= : Filter by path prefix}'
  static description = 'List API routes that would be exposed as MCP tools'

  constructor(
    @inject(DI_TOKENS.Application) private app: Application,
    @inject(OPENAPI_TOKENS.OpenAPIService) private openAPIService: OpenAPIService,
  ) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const tags = this.array('tag')
    const pathPrefix = this.string('path')

    const hono = await this.app.ensureHono()
    const spec = this.openAPIService.getSpec(hono, this.app.container)

    const service = new OpenApiToolsService(spec)
    const filter = {
      tags: tags.length > 0 ? tags : undefined,
      pathPrefix: pathPrefix || undefined,
    }
    const tools = service.getTools(filter)

    if (tools.length === 0) {
      this.info('No tools found')
      return 0
    }

    this.table(
      ['Name', 'Method', 'Path', 'Description'],
      tools.map((t) => [t.name, t.method, t.path, t.description]),
    )

    return 0
  }
}
