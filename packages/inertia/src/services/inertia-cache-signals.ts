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
}

/**
 * Report the conditions that make an Inertia page unsafe to cache.
 *
 * A `once()` prop is the subtle one: it is contractually sent a single time,
 * so replaying it from cache to every client breaks the guarantee the API makes.
 */
export function buildInertiaCacheSignals(input: InertiaCacheSignalInput): InertiaCacheSignals {
  return {
    hasFlash: Object.keys(input.flash).length > 0,
    isPartial: input.isPartial,
    hasOnceProps: Object.keys(input.onceProps).length > 0,
  }
}
