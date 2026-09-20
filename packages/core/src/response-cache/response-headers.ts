/**
 * Set (or delete, via `null`) one or more headers on a `Response`, mutating
 * in place whenever the header list allows it.
 *
 * A `Response`'s header list has a "guard" — per the Fetch spec, plain
 * `Response`s (anything built with `new Response(...)`, which is what every
 * Stratal controller returns) get guard `"response"`, which is mutable.
 * `.set()`/`.delete()` only throw for guard `"immutable"`, which shows up for
 * responses obtained from a `fetch()` subrequest or otherwise already handed
 * off — not for a response this Worker constructed itself. That's the
 * overwhelming majority of what flows through this function, so mutating in
 * place avoids cloning the response (and re-wrapping its body stream) on
 * every request just to add a `Cache-Control` header.
 *
 * Falls back to reconstructing the `Response` only when a `.set()`/`.delete()`
 * call actually throws. Skips touching the response entirely outside the
 * `[200, 599]` status range: the `Response` constructor throws a `RangeError`
 * for a status outside that range (notably `101`), and — for a `101`
 * WebSocket-upgrade response specifically — reconstructing would drop
 * Cloudflare's `webSocket`/`cf` init fields the original carried, which
 * `{ status, statusText, headers }` alone can't reproduce.
 */
export function setResponseHeaders(response: Response, headers: Record<string, string | null>): Response {
  if (response.status < 200 || response.status > 599) return response

  try {
    for (const [name, value] of Object.entries(headers)) {
      if (value === null) response.headers.delete(name)
      else response.headers.set(name, value)
    }
    return response
  } catch {
    const merged = new Headers(response.headers)
    for (const [name, value] of Object.entries(headers)) {
      if (value === null) merged.delete(name)
      else merged.set(name, value)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: merged,
    })
  }
}

/** `public` as a whole directive, not the substring inside `no-cache="public"` or a field name. */
const PUBLIC_DIRECTIVE = /(?:^|,)\s*public\s*(?:,|$)/

/**
 * Whether a SHARED cache is permitted to store this response and serve it to a
 * different caller.
 *
 * `public` and `s-maxage` are the two directives that say so outright (RFC 9111
 * §5.2.2). Everything else is treated as not shared-cacheable: `private` and
 * `no-store` say so explicitly, and a response with no `Cache-Control` at all
 * never reaches a caller in a Stratal app without one — `createNoStoreFallback\
Middleware` stamps it first.
 *
 * `CDN-Cache-Control` is read the same way and counts on its own. It is the
 * header a CDN honours in preference to `Cache-Control`, so a response can be
 * stored and replayed to other callers on the strength of it alone — reading
 * only `Cache-Control` would call such a response private and leave whatever
 * this guards, per-caller headers included, to be served to everyone.
 */
export function isSharedCacheable(response: Response): boolean {
  const says = (header: string): boolean => {
    const directives = response.headers.get(header)?.toLowerCase() ?? ''
    return PUBLIC_DIRECTIVE.test(directives) || directives.includes('s-maxage')
  }

  return says('Cache-Control') || says('CDN-Cache-Control')
}
