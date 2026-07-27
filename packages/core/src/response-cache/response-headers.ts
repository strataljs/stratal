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
export function setResponseHeaders(
  response: Response,
  headers: Record<string, string | null>,
): Response {
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
