import { INERTIA_VARY_HEADERS } from '../types'

export interface InertiaCacheSignalInput {
  flash: Record<string, unknown>
  isPartial: boolean
  /**
   * `processProps`'s `onceProps` result — keyed by prop name, describing the
   * wire-level once-prop metadata (`{ prop, expiresAt? }`). NOT the raw props
   * object: by the time props reach the render pipeline, `processProps` has
   * already resolved `once()` wrapper objects into their callback's return
   * value, so scanning `props` for the `once()` marker would never find it.
   */
  onceProps: Record<string, { prop: string; expiresAt?: number | null }>
}

export interface InertiaCacheSignals {
  hasFlash: boolean
  isPartial: boolean
  hasOnceProps: boolean
  /**
   * The request headers this response is a function of, for the response cache
   * to declare in `Vary`.
   *
   * Reported from here rather than left to the middleware that also unions them
   * on, because the cacheability check needs to KNOW the response is keyed on
   * them. A partial reload arriving with an empty list is refused rather than
   * cached under a key that does not describe which props it carries.
   */
  varyHeaders: readonly string[]
}

/**
 * Report the conditions that make an Inertia page unsafe to cache, and the
 * request headers a safe one must be keyed on.
 *
 * A `once()` prop is the subtle one: it is contractually sent a single time,
 * so replaying it from cache to every client breaks the guarantee the API makes.
 *
 * A partial reload is NOT among them. It is a deterministic function of the URL
 * and of `INERTIA_VARY_HEADERS`, so it caches correctly once keyed on those —
 * and refusing it outright made every deferred prop permanently uncacheable,
 * which on a page that defers its expensive work is the whole of the cost.
 */
export function buildInertiaCacheSignals(input: InertiaCacheSignalInput): InertiaCacheSignals {
  return {
    hasFlash: Object.keys(input.flash).length > 0,
    isPartial: input.isPartial,
    hasOnceProps: Object.keys(input.onceProps).length > 0,
    varyHeaders: INERTIA_VARY_HEADERS,
  }
}
