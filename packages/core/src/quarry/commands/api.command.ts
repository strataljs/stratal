import { inject } from 'tsyringe'
import type { Application } from '../../application'
import { DI_TOKENS } from '../../di/tokens'
import { Command } from '../command'
import { bold, cyan, green, red, yellow } from '../colors'

export class ApiCommand extends Command {
  static command = 'api {route?} {--method= : HTTP method} {--data= : JSON request body} {--header=* : Headers (Key:Value)} {--query=* : Query params (key=value)}'
  static description = 'Call an API route directly'
  static aliases = ['api:call']

  constructor(@inject(DI_TOKENS.Application) private app: Application) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const route = this.string('route')

    if (!route) {
      return (await this.call('route:list')).exitCode
    }

    return this.callRoute(route)
  }

  private async callRoute(route: string): Promise<number> {
    const method = (this.string('method') || 'GET').toUpperCase()
    const data = this.string('data')
    const headerArgs = this.array('header')
    const queryArgs = this.array('query')

    const headers: Record<string, string> = {}
    if (data) {
      headers['Content-Type'] = 'application/json'
    }
    for (const h of headerArgs) {
      const colonIdx = h.indexOf(':')
      if (colonIdx > 0) {
        headers[h.slice(0, colonIdx).trim()] = h.slice(colonIdx + 1).trim()
      }
    }

    // Build query string
    let url = route
    if (queryArgs.length > 0) {
      const parts = queryArgs.map((q) => {
        const eqIdx = q.indexOf('=')
        if (eqIdx > 0) {
          return `${encodeURIComponent(q.slice(0, eqIdx))}=${encodeURIComponent(q.slice(eqIdx + 1))}`
        }
        return encodeURIComponent(q)
      })
      url += `?${parts.join('&')}`
    }

    const request = new Request(`http://localhost${url}`, {
      method,
      headers,
      body: data || undefined,
    })

    const hono = await this.app.ensureHono()
    const response = await hono.fetch(request, this.app.env)
    const body = await response.text()

    // Color-coded status
    const statusText = `${response.status} ${response.statusText}`
    let coloredStatus: string
    if (response.status >= 200 && response.status < 300) {
      coloredStatus = green(bold(statusText))
    } else if (response.status >= 300 && response.status < 400) {
      coloredStatus = yellow(bold(statusText))
    } else {
      coloredStatus = red(bold(statusText))
    }

    this.line(`${cyan(method)} ${route} ${coloredStatus}`)
    this.newLine()

    // Response headers
    const headerLines: string[] = []
    response.headers.forEach((value, key) => {
      headerLines.push(`  ${key}: ${value}`)
    })
    if (headerLines.length > 0) {
      this.line(bold('Headers:'))
      for (const hl of headerLines) {
        this.line(hl)
      }
      this.newLine()
    }

    // Body
    if (body) {
      this.line(bold('Body:'))
      try {
        this.line(JSON.stringify(JSON.parse(body), null, 2))
      } catch {
        this.line(body)
      }
    }

    return response.status >= 400 ? 1 : 0
  }
}
