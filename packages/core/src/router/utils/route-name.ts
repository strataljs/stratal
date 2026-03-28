/**
 * Route naming utilities.
 *
 * Extracts parameter names from paths and domains,
 * and generates convention-based route names.
 */

/**
 * Extract parameter names from a Hono-style path.
 *
 * @example
 * extractParamNames('/users/:id')                     // ['id']
 * extractParamNames('/:companyId/users/:userId')      // ['companyId', 'userId']
 * extractParamNames('/users')                         // []
 */
export function extractParamNames(path: string): string[] {
  const matches = path.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)
  return [...matches].map(m => m[1])
}

/**
 * Extract parameter names from a domain pattern.
 *
 * @example
 * extractDomainParamNames('{tenant}.example.com')           // ['tenant']
 * extractDomainParamNames('{region}.{tenant}.example.com')  // ['region', 'tenant']
 * extractDomainParamNames('example.com')                    // []
 */
export function extractDomainParamNames(domain: string): string[] {
  const matches = domain.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)
  return [...matches].map(m => m[1])
}

/**
 * Auto-generate a route name for convention-based `@Route` methods.
 *
 * Strips common prefixes (`/api/`, `/v{N}/`) and parameter segments,
 * then joins remaining static segments with dots and appends the method name.
 *
 * @example
 * generateConventionRouteName('/users', 'index')                         // 'users.index'
 * generateConventionRouteName('/users', 'show')                          // 'users.show'
 * generateConventionRouteName('/api/v1/users', 'create')                 // 'users.create'
 * generateConventionRouteName('/api/v1/users/:userId/notes', 'index')    // 'users.notes.index'
 * generateConventionRouteName('/:companyId/users', 'index')              // 'users.index'
 * generateConventionRouteName('/users/:userId/notes/:noteId/tags', 'index') // 'users.notes.tags.index'
 */
export function generateConventionRouteName(basePath: string, methodName: string): string {
  const segments = basePath
    .split('/')
    .filter(Boolean)
    // Strip /api prefix
    .filter(s => s !== 'api')
    // Strip version prefixes like v1, v2
    .filter(s => !/^v\d+$/.test(s))
    // Strip parameter segments like :id, :companyId
    .filter(s => !s.startsWith(':'))

  if (segments.length === 0) {
    return methodName
  }

  return `${segments.join('.')}.${methodName}`
}
