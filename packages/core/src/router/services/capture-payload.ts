import type { Context } from 'hono'
import type { CacheableOptions, PurgesCacheOptions } from '../../response-cache/types'
import { ROUTER_CONTEXT_KEYS } from '../constants'

/** Does any declared tag template read the `{data.*}` scope? */
function readsDataScope(tags: string[] | undefined): boolean {
  return (tags ?? []).some((tag) => tag.includes('{data.'))
}

/**
 * Whether this route needs its handler's JSON payload captured.
 *
 * Evaluated once at route registration, never per request: capturing
 * unconditionally would clone and re-parse every JSON response body in the
 * application, doubling parse cost on a hot path that has nothing to do with
 * caching.
 */
export function needsPayloadCapture(
  cacheable: CacheableOptions | undefined,
  purges: PurgesCacheOptions | undefined,
): boolean {
  return readsDataScope(cacheable?.tags) || readsDataScope(purges?.tags)
}

/**
 * Matches the JSON family: `application/json` plus any `+json` structured
 * suffix (`application/problem+json`, `application/ld+json`,
 * `application/vnd.api+json`), with or without parameters.
 */
const JSON_CONTENT_TYPE = /^application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i

/**
 * Record the handler's structured payload so `{data.*}` cache tags can read
 * values the request itself never carried — a post's category ID on a publish
 * route.
 *
 * **This does not decide what is cacheable.** Every content type Workers
 * Caching stores — HTML, text, images, binary, streams — is cached exactly the
 * same way; `@Cacheable` is content-type agnostic. This function only decides
 * whether a tag can interpolate a value *out of the response body*, which
 * requires a body that parses into an object. Non-JSON routes still cache
 * normally and can still tag from `{param.*}` and `{query.*}` — never
 * `{body.*}`, which `bindRouteCache` rejects at registration because the
 * router never has a parsed request body available to populate it.
 * Inertia sets the payload directly when building its page response, so its
 * HTML documents support
 * `{data.*}` without any parsing here.
 *
 * Clones before reading: consuming the returned Response's body would leave
 * nothing to send.
 */
export async function capturePayload(
  c: Context,
  response: Response,
): Promise<void> {
  if (c.get(ROUTER_CONTEXT_KEYS.RESPONSE_PAYLOAD)) return
  if (!JSON_CONTENT_TYPE.test(response.headers.get('Content-Type') ?? '')) return

  try {
    c.set(ROUTER_CONTEXT_KEYS.RESPONSE_PAYLOAD, await response.clone().json())
  } catch {
    // A malformed body on a JSON content type is not worth failing a request
    // over — `{data.*}` will report the value as missing and throw there.
  }
}
