import { inject } from 'tsyringe'
import type { RouteRegistry, RegisteredRoute } from '../../router/route-registry'
import { ROUTER_TOKENS } from '../../router/router.tokens'
import { Command } from '../command'

/**
 * List all registered routes from RouteRegistry.
 *
 * By default, hidden routes (hideFromDocs) are excluded.
 * Use `--hidden` to include them.
 *
 * @example
 * ```bash
 * quarry route:list
 * quarry route:list --method=GET
 * quarry route:list --path=/users
 * quarry route:list --name=users
 * quarry route:list --hidden
 * ```
 */
export class RouteListCommand extends Command {
  static command = 'route:list {--method= : Filter by HTTP method} {--path= : Filter by path substring} {--name= : Filter by route name} {--hidden : Include hidden routes}'
  static description = 'List all registered routes'

  constructor(@inject(ROUTER_TOKENS.RouteRegistry) private registry: RouteRegistry) {
    super()
  }

  handle(): number | undefined {
    const methodFilter = this.string('method').toUpperCase()
    const pathFilter = this.string('path')
    const nameFilter = this.string('name')
    const showHidden = this.boolean('hidden')

    let routes = this.registry.all()

    // Filter hidden routes (default: exclude)
    if (!showHidden) {
      routes = routes.filter(r => !r.hidden)
    }

    if (methodFilter) {
      routes = routes.filter(r => r.method.toUpperCase() === methodFilter)
    }

    if (pathFilter) {
      routes = routes.filter(r => r.path.includes(pathFilter))
    }

    if (nameFilter) {
      routes = routes.filter(r => r.name?.includes(nameFilter))
    }

    if (routes.length === 0) {
      this.info('No routes found')
      return 0
    }

    this.table(
      ['Method', 'Path', 'Name', 'Handler', 'Domain'],
      routes.map(r => this.formatRow(r)),
    )

    return undefined
  }

  private formatRow(route: RegisteredRoute): string[] {
    return [
      route.method.toUpperCase(),
      route.path,
      route.name ?? '-',
      `${route.controller}.${route.action}`,
      route.domain ?? '-',
    ]
  }
}
