/**
 * Folding a response's *representation* into the cache key.
 *
 * A route may answer one URL with more than one body — an HTML document and a
 * JSON payload for the same page, say — chosen from a request header. HTTP's
 * answer is `Vary`, and Workers Caching documents it as honoured, so a
 * response that declares `Vary: X-Inertia` should be stored once per distinct
 * value of that header.
 *
 * Measured, it is not reliable: on a URL carrying a query string, a variant
 * stored for one value of the header is served to a request sending another,
 * so a browser navigation receives the JSON meant for a client-side visit.
 * `Vary` is a matching pass applied to an entry that has already been located
 * by key; `ctx.props` IS part of the key, and Cloudflare documents it as
 * impossible to bypass — the same property that makes it the mechanism for
 * per-caller partitioning.
 *
 * So the representation goes in the key. Two representations become two
 * entries, and nothing downstream has to match correctly for the right one to
 * come back. `Vary` is still emitted, because it is what tells the *browser*
 * cache the same thing and the Inertia protocol requires it — it is simply no
 * longer load-bearing here.
 */

/**
 * The `ctx.props` key the representation is carried under.
 *
 * `$`-prefixed so it cannot collide with a partition name: partitions are
 * referenced from `partitionBy: ['user']` and are written as identifiers, and
 * `assertPartitionNames` rejects the prefix outright rather than letting a
 * collision silently overwrite one or the other.
 */
export const REPRESENTATION_PROP = '$representation'

/**
 * Headers the platform varies on by itself, which therefore need no key of
 * ours.
 *
 * Compression is negotiated and stored by Cloudflare independently of the
 * response body the Worker returns, so `Vary: Accept-Encoding` — which almost
 * every framework and proxy emits — describes something already handled. Left
 * out of this list it would make nearly every response uncacheable.
 */
const PLATFORM_HANDLED = new Set(['accept-encoding'])

/**
 * The request's values for `keyBy`, as one deterministic string.
 *
 * Names are lowercased and sorted so that reordering `keyBy` does not
 * re-partition a live cache, and each value is carried as `null` when the
 * header is absent — a header that is missing and one sent empty are different
 * requests and must not collapse onto one entry.
 *
 * Returns `undefined` when nothing is declared, so the common case adds no
 * prop at all and leaves the key exactly as it was.
 */
export function representationOf(
  headers: Headers,
  keyBy: readonly string[] | undefined,
): string | undefined {
  if (!keyBy || keyBy.length === 0) return undefined

  const names = [...new Set(keyBy.map((name) => name.toLowerCase()))].sort()

  return JSON.stringify(names.map((name) => [name, headers.get(name)]))
}

/**
 * The names a response says it varies on that are NOT in the cache key.
 *
 * Each one is a way for two different bodies to share one entry, so a response
 * naming any of them is refused rather than stored — see `CacheabilityService`.
 * `*` counts as unkeyed: Cloudflare treats `Vary: *` as uncacheable anyway, and
 * it cannot be satisfied from request headers by definition.
 */
export function unkeyedVary(
  varyHeader: string | null,
  keyBy: readonly string[] | undefined,
): string[] {
  if (!varyHeader) return []

  const keyed = new Set((keyBy ?? []).map((name) => name.toLowerCase()))

  return varyHeader
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .filter((name) => !keyed.has(name) && !PLATFORM_HANDLED.has(name))
}
