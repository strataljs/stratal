import { InvalidCacheTagError } from './errors'

/**
 * Values available to `{scope.path}` placeholders when rendering tags.
 *
 * `body` is never populated by the HTTP router — `RouteRegistrationService
 * .buildTagScopes` always sets it `undefined`, and route registration now
 * rejects any `{body.*}` tag at boot (`bindRouteCache`) precisely because
 * nothing can ever fill it in on the request path. It stays part of this
 * type — rather than being dropped — because `renderTags` is a general
 * template compiler exercised directly in its own unit tests with hand-built
 * scopes (including `body`); those tests are about the compiler accepting
 * all four scopes correctly, independent of what any one caller can supply.
 */
export interface TagScopes {
  param: Record<string, string>
  query: Record<string, string>
  body: unknown
  data: unknown
}

/** Cloudflare's per-tag ceiling. Longer tags are dropped silently. */
const MAX_TAG_BYTES = 1024
/** Hoisted: one encoder for the process, not one per tag per request. */
const TEXT_ENCODER = new TextEncoder()
/**
 * Printable ASCII (`0x21`–`0x7E`) — which already excludes space, every C0
 * control (`\t`, `\r`, `\n`, `\v`, `\f`), `DEL`, and all non-ASCII, so header
 * splitting via CR/LF is impossible — **minus** the two characters that carry
 * structural meaning inside the header this value is written into:
 *
 * - `,` (`0x2C`) delimits the `Cache-Tag` list. `CacheabilityService.apply`
 *   joins tags with `','`, so a rendered tag containing a comma is not one tag
 *   — it becomes two, neither of which is the tag the author named, and every
 *   later purge for the intended tag misses forever. On the `@PurgesCache`
 *   path it is worse: rendered tags are handed straight to `ctx.cache.purge()`,
 *   so a comma arriving in request input (`?t=a,b`) purges tags the author
 *   never wrote — an arbitrary cache-flush primitive driven by the request.
 * - `"` (`0x22`) opens a quoted-string in an RFC 9110 §5.6.1 comma-delimited
 *   list. An unbalanced quote makes a strict parser stop treating the
 *   following commas as delimiters, smuggling list structure the same way.
 *
 * `\` is deliberately still allowed: it only has meaning *inside* a
 * quoted-string, and `"` can no longer appear to open one.
 */
const VALID_TAG = /^[\x21\x23-\x2B\x2D-\x7E]+$/
const PLACEHOLDER = /\{([A-Za-z]+)\.([^}]+)\}/g
const SCOPES = ['param', 'query', 'body', 'data'] as const

/**
 * Render `Cache-Tag` templates against the current request's scopes.
 *
 * A single `.*` suffix expands an array into one tag per element. Missing
 * values throw rather than rendering a broken tag: Cloudflare drops invalid
 * tags without any signal, so a silently-wrong tag means a purge that misses
 * forever.
 */
export function renderTags(templates: string[], scopes: TagScopes): string[] {
  const out: string[] = []
  // A `Set` keeps membership checks O(1) — an `Array.includes` scan here would
  // make a fan-out template (`{body.ids.*}` over hundreds of ids) quadratic.
  // The array still carries insertion order for the returned result.
  const seen = new Set<string>()

  for (const template of templates) {
    for (const tag of renderOne(template, scopes)) {
      assertValidTag(tag)
      if (!seen.has(tag)) {
        seen.add(tag)
        out.push(tag)
      }
    }
  }

  return out
}

/** Throw unless `tag` is something Cloudflare will actually store. */
export function assertValidTag(tag: string): void {
  if (tag.length === 0) {
    throw new InvalidCacheTagError(tag, 'tag is empty')
  }
  if (TEXT_ENCODER.encode(tag).length > MAX_TAG_BYTES) {
    throw new InvalidCacheTagError(tag, `exceeds ${MAX_TAG_BYTES} bytes`)
  }
  if (!VALID_TAG.test(tag)) {
    throw new InvalidCacheTagError(
      tag,
      'must be printable ASCII with no space, comma, or double quote — a comma would split ' +
        'this into two `Cache-Tag` entries, neither of which is the tag that was declared',
    )
  }
}

/** Render one template, expanding at most one `.*` fan-out. */
function renderOne(template: string, scopes: TagScopes): string[] {
  const matches = [...template.matchAll(PLACEHOLDER)]
  const fanOuts = matches.filter((m) => m[2].endsWith('.*'))

  if (fanOuts.length > 1) {
    throw new InvalidCacheTagError(template, 'only one `.*` fan-out is supported per tag')
  }

  if (fanOuts.length === 0) {
    return [substitute(matches, scopes, undefined, template)]
  }

  const [fan] = fanOuts
  const path = fan[2].slice(0, -2)
  const value = lookup(fan[1], path, scopes, template)

  if (!Array.isArray(value)) {
    throw new InvalidCacheTagError(template, `\`${fan[1]}.${path}\` is not an array`)
  }

  return value.map((item) =>
    substitute(matches, scopes, { placeholder: fan[0], item }, template),
  )
}

/** Replace every placeholder with its resolved value, left to right. */
function substitute(
  matches: RegExpMatchArray[],
  scopes: TagScopes,
  fan: { placeholder: string; item: unknown } | undefined,
  template: string,
): string {
  const parts: string[] = []
  let cursor = 0

  for (const match of matches) {
    const [placeholder, scope, path] = match
    const index = match.index ?? 0

    parts.push(template.slice(cursor, index))

    const value =
      fan && placeholder === fan.placeholder ? fan.item : lookup(scope, path, scopes, template)
    parts.push(stringify(value, template))

    cursor = index + placeholder.length
  }

  parts.push(template.slice(cursor))

  return parts.join('')
}

/** Walk `scope.path`, throwing on an unknown scope or a missing value. */
function lookup(scope: string, path: string, scopes: TagScopes, template: string): unknown {
  if (!(SCOPES as readonly string[]).includes(scope)) {
    throw new InvalidCacheTagError(
      template,
      `unknown scope "${scope}" (expected one of ${SCOPES.join(', ')})`,
    )
  }

  let current: unknown = scopes[scope as keyof TagScopes]

  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      throw new InvalidCacheTagError(template, `\`${scope}.${path}\` is not present on this request`)
    }
    current = (current as Record<string, unknown>)[segment]
  }

  if (current === null || current === undefined) {
    throw new InvalidCacheTagError(template, `\`${scope}.${path}\` is not present on this request`)
  }

  return current
}

/** Coerce an interpolated value to its tag text. */
function stringify(value: unknown, template: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new InvalidCacheTagError(template, `interpolated value has unsupported type "${typeof value}"`)
}
