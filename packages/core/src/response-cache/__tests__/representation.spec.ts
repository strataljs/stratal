import { describe, expect, it } from 'vitest'
import { representationOf, unkeyedVary } from '../representation'

describe('representationOf', () => {
  it('is undefined when nothing is declared, so the key is left alone', () => {
    expect(representationOf(new Headers({ 'X-Inertia': 'true' }), [])).toBeUndefined()
    expect(representationOf(new Headers(), undefined)).toBeUndefined()
  })

  it('separates a document request from an Inertia visit', () => {
    const doc = representationOf(new Headers(), ['X-Inertia'])
    const visit = representationOf(new Headers({ 'X-Inertia': 'true' }), ['X-Inertia'])

    // The whole point: these become different `ctx.props`, so Workers Caching
    // stores them as different entries rather than one entry with two variants.
    expect(doc).not.toBe(visit)
  })

  it('separates two partial reloads asking for different props', () => {
    const keyBy = ['X-Inertia', 'X-Inertia-Partial-Data']
    const a = representationOf(new Headers({ 'X-Inertia': 'true', 'X-Inertia-Partial-Data': 'parent' }), keyBy)
    const b = representationOf(new Headers({ 'X-Inertia': 'true', 'X-Inertia-Partial-Data': 'children' }), keyBy)

    expect(a).not.toBe(b)
  })

  it('distinguishes an absent header from one sent empty', () => {
    const absent = representationOf(new Headers(), ['X-Inertia'])
    const empty = representationOf(new Headers({ 'X-Inertia': '' }), ['X-Inertia'])

    expect(absent).not.toBe(empty)
  })

  it('does not re-partition a live cache when keyBy is reordered or re-cased', () => {
    const headers = new Headers({ 'X-Inertia': 'true', 'X-Inertia-Reset': 'a' })

    expect(representationOf(headers, ['X-Inertia', 'X-Inertia-Reset'])).toBe(
      representationOf(headers, ['x-inertia-reset', 'X-INERTIA']),
    )
  })

  it('ignores headers it was not told to key on', () => {
    const keyBy = ['X-Inertia']

    expect(representationOf(new Headers({ 'X-Inertia': 'true', 'X-Request-Id': '1' }), keyBy)).toBe(
      representationOf(new Headers({ 'X-Inertia': 'true', 'X-Request-Id': '2' }), keyBy),
    )
  })
})

describe('unkeyedVary', () => {
  it('reports nothing for a response that varies on nothing', () => {
    expect(unkeyedVary(null, ['X-Inertia'])).toEqual([])
    expect(unkeyedVary('', ['X-Inertia'])).toEqual([])
  })

  it('reports a varied header that is not in the key', () => {
    expect(unkeyedVary('X-Inertia, Accept-Language', ['X-Inertia'])).toEqual(['accept-language'])
  })

  it('accepts a keyed header whatever the casing on either side', () => {
    expect(unkeyedVary('X-INERTIA', ['x-inertia'])).toEqual([])
  })

  it('treats Accept-Encoding as already handled by the platform', () => {
    expect(unkeyedVary('Accept-Encoding', [])).toEqual([])
  })

  it('reports `*`, which no request header can satisfy', () => {
    expect(unkeyedVary('*', ['X-Inertia'])).toEqual(['*'])
  })
})
