import { describe, expect, it } from 'vitest'
import { buildInertiaCacheSignals } from '../services/inertia-cache-signals'
import { INERTIA_VARY_HEADERS } from '../types'

describe('buildInertiaCacheSignals', () => {
  it('reports a clean page as cacheable', () => {
    expect(buildInertiaCacheSignals({ flash: {}, isPartial: false, onceProps: {} })).toEqual({
      hasFlash: false,
      isPartial: false,
      hasOnceProps: false,
      varyHeaders: INERTIA_VARY_HEADERS,
    })
  })

  it('reports the vary headers on a partial reload, so it can be cached as its own variant', () => {
    const signals = buildInertiaCacheSignals({ flash: {}, isPartial: true, onceProps: {} })
    expect(signals.varyHeaders).toContain('X-Inertia-Partial-Data')
    expect(signals.varyHeaders).toContain('X-Inertia-Partial-Component')
  })

  it('names every header the partial-request reader consults', () => {
    // Each of these changes which props the response carries, so one missing
    // from Vary means two different bodies share a cache entry at one URL.
    expect([...INERTIA_VARY_HEADERS]).toEqual([
      'X-Inertia',
      'X-Inertia-Partial-Component',
      'X-Inertia-Partial-Data',
      'X-Inertia-Partial-Except',
      'X-Inertia-Reset',
      'X-Inertia-Resolve-Deferred',
      'x-inertia-infinite-scroll-merge-intent',
    ])
  })

  it('flags non-empty flash data', () => {
    const signals = buildInertiaCacheSignals({ flash: { success: 'saved' }, isPartial: false, onceProps: {} })
    expect(signals.hasFlash).toBe(true)
  })

  it('flags a partial reload', () => {
    expect(buildInertiaCacheSignals({ flash: {}, isPartial: true, onceProps: {} }).isPartial).toBe(true)
  })

  it('flags a once() prop', () => {
    // Shape matches `processProps`'s real `onceProps` output — keyed by prop
    // name, value describing the wire-level once-prop metadata — not the
    // raw props object (the `once()` wrapper is already unwrapped by the
    // time props reach this builder, so the INERTIA_PROP_ONCE symbol is gone).
    const onceProps = { banner: { prop: 'banner' } }
    expect(buildInertiaCacheSignals({ flash: {}, isPartial: false, onceProps }).hasOnceProps).toBe(true)
  })

  it('reports no once props for an empty onceProps map', () => {
    expect(buildInertiaCacheSignals({ flash: {}, isPartial: false, onceProps: {} }).hasOnceProps).toBe(false)
  })
})
