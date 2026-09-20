/**
 * What makes a level itself, as opposed to where it currently points.
 *
 * The contract both bundles answer "is this the same level?" by, framework-free like the rest of
 * `core`, so the server deciding what a referer names and the client deciding what a response
 * addresses cannot drift apart. Two spellings of one route reaching different answers is a
 * navigation loop that reproduces on one route and not another.
 */

/**
 * A url reduced to the level it names.
 *
 * A level's `url` carries its query and may carry a fragment, because that is its address — what a
 * refresh re-reads and what closing the level above lands on. Its identity is the path alone: a
 * refined query is the same sheet showing something else, and a fragment is a position within it.
 * `/parent/42/edit` and `/parent/42/edit/` are one route, so an app that appends a trailing slash
 * does not spell a second level by writing the same one twice. The root keeps its slash, being the
 * whole path rather than a trailing one.
 *
 * A held url may be relative, so it cannot go through `new URL`.
 */
export function levelPath(url: string): string {
  const path = url.split(/[?#]/)[0] ?? ''
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/** Whether two urls name the same level, whatever each is currently showing. */
export function samePath(a: string, b: string): boolean {
  return levelPath(a) === levelPath(b)
}
