import { describe, expect, it } from 'vitest'
import { buildInertiaCacheSignals } from '../services/inertia-cache-signals'

describe('buildInertiaCacheSignals', () => {
  it('reports a clean page as cacheable', () => {
    expect(buildInertiaCacheSignals({ flash: {}, isPartial: false, onceProps: {} })).toEqual({
      hasFlash: false,
      isPartial: false,
      hasOnceProps: false,
    })
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
