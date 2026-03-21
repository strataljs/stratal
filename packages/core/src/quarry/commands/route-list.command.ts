import { inject } from 'tsyringe'
import type { Application } from '../../application'
import { DI_TOKENS } from '../../di/tokens'
import { Command } from '../command'

export class RouteListCommand extends Command {
  static command = 'route:list {--method= : Filter by HTTP method} {--path= : Filter by path substring}'
  static description = 'List all registered routes'

  constructor(@inject(DI_TOKENS.Application) private app: Application) {
    super()
  }

  handle(): number | undefined {
    const methodFilter = this.string('method').toUpperCase()
    const pathFilter = this.string('path')

    // Deduplicate by method+path — last handler wins (middleware/guards come before the actual handler)
    const deduped = new Map<string, { method: string; path: string; name: string }>()
    for (const r of this.app.hono.routes) {
      deduped.set(`${r.method}:${r.path}`, { method: r.method, path: r.path, name: r.handler.name })
    }

    let routes = [...deduped.values()].filter(r => r.name)

    if (methodFilter) {
      routes = routes.filter(r => r.method.toUpperCase() === methodFilter)
    }

    if (pathFilter) {
      routes = routes.filter(r => r.path.includes(pathFilter))
    }

    if (routes.length === 0) {
      this.info('No routes found')
      return 0
    }

    this.table(
      ['Method', 'Path', 'Action', 'Type'],
      routes.map(r => {
        const isWs = r.name.startsWith('ws:')
        const action = r.name.replace(/^(http|ws):/, '')
        return [r.method.toUpperCase(), r.path, action || r.name, isWs ? 'WS' : 'HTTP']
      }),
    )

    return undefined
  }
}
