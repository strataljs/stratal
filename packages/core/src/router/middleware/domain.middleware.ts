import type { Context, MiddlewareHandler } from 'hono';
import { abort } from '../../errors';
import type { RouterEnv } from '../types';

/**
 * Parse a domain pattern into a regex and extract parameter names.
 *
 * @example
 * parseDomainPattern('{tenant}.example.com')
 * // => { regex: /^([^.]+)\.example\.com$/, paramNames: ['tenant'] }
 *
 * parseDomainPattern('{region}.{tenant}.example.com')
 * // => { regex: /^([^.]+)\.([^.]+)\.example\.com$/, paramNames: ['region', 'tenant'] }
 */
export function parseDomainPattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = []

  const regexStr = pattern.replace(
    /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_match, paramName: string) => {
      paramNames.push(paramName)
      return '([^.]+)'
    }
  )

  // Escape dots in the remaining static parts
  const escaped = regexStr.replace(/\./g, '\\.')
  return { regex: new RegExp(`^${escaped}$`), paramNames }
}

/**
 * Strip port number from a host header value.
 * 'example.com:8787' => 'example.com'
 */
function stripPort(host: string): string {
  const colonIdx = host.lastIndexOf(':')
  if (colonIdx === -1) return host
  // Check if it's actually a port (digits after the colon)
  const afterColon = host.slice(colonIdx + 1)
  return /^\d+$/.test(afterColon) ? host.slice(0, colonIdx) : host
}

/**
 * Create a Hono middleware that matches the request host against a domain pattern.
 *
 * When the host matches, domain parameters are extracted and stored in context
 * variables accessible via `ctx.domain(key)`.
 *
 * When the host does NOT match, aborts with 404.
 *
 * @param pattern - Domain pattern with `{param}` placeholders (e.g., '{tenant}.myapp.com')
 *
 * @example
 * ```typescript
 * // Applied automatically by RouteRegistrationService for controllers with domain config
 * @Controller('/dashboard', { domain: '{tenant}.myapp.com' })
 * export class DashboardController {
 *   async index(ctx: RouterContext) {
 *     const tenant = ctx.domain('tenant')
 *   }
 * }
 * ```
 */
export function createDomainMiddleware(pattern: string): MiddlewareHandler<RouterEnv> {
  const { regex, paramNames } = parseDomainPattern(pattern)

  return async (c: Context<RouterEnv>, next: () => Promise<void>) => {
    const host = stripPort(c.req.header('host') ?? '')
    const match = regex.exec(host)

    if (!match) {
      abort(404, 'Domain mismatch')
    }

    // Store domain params as context variables
    for (let i = 0; i < paramNames.length; i++) {
      c.set(`domain:${paramNames[i]}`, match[i + 1])
    }

    await next()
  }
}
