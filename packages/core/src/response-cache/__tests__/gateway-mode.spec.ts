import { describe, expect, it } from 'vitest'
import { isGatewayMode, markGatewayMode } from '../gateway-mode'

describe('gateway mode signalling', () => {
  it('reports an unmarked context as not in gateway mode', () => {
    expect(isGatewayMode({ waitUntil() { /* noop */ } })).toBe(false)
  })

  it('reports a marked context as in gateway mode', () => {
    const ctx = { waitUntil() { /* noop */ } }
    markGatewayMode(ctx)
    expect(isGatewayMode(ctx)).toBe(true)
  })

  it('returns the same object it was given, so it can be used inline', () => {
    const ctx = { waitUntil() { /* noop */ } }
    expect(markGatewayMode(ctx)).toBe(ctx)
  })

  it('marks by identity, not by shape — a structural twin is not in gateway mode', () => {
    // This is what makes the signal unforgeable from a request: there is no
    // value a client can send that produces the *object* the runtime handed
    // to `Stratal.fetch`.
    const ctx = { waitUntil() { /* noop */ } }
    markGatewayMode(ctx)
    expect(isGatewayMode({ ...ctx })).toBe(false)
  })

  it('adds no enumerable property, so the mark cannot be observed or copied', () => {
    const ctx = { waitUntil() { /* noop */ } }
    markGatewayMode(ctx)

    expect(Object.keys(ctx)).toEqual(['waitUntil'])
    expect(Reflect.ownKeys(ctx)).toEqual(['waitUntil'])
  })

  it('does not mutate the context, so a frozen runtime object is safe to mark', () => {
    const ctx = Object.freeze({ waitUntil() { /* noop */ } })
    expect(() => markGatewayMode(ctx)).not.toThrow()
    expect(isGatewayMode(ctx)).toBe(true)
  })

  it('treats null and non-objects as not in gateway mode', () => {
    expect(isGatewayMode(null)).toBe(false)
    expect(isGatewayMode(undefined)).toBe(false)
    expect(isGatewayMode('gateway')).toBe(false)
  })
})
