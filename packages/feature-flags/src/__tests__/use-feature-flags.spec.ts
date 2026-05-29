import { describe, expect, it, vi } from 'vitest'

const usePage = vi.fn()
vi.mock('@inertiajs/react', () => ({ usePage: () => usePage() }))

const { useFeatureFlags, useFlag } = await import('../react/use-feature-flags')

describe('useFeatureFlags / useFlag', () => {
  it('returns the shared featureFlags map', () => {
    usePage.mockReturnValue({ props: { featureFlags: { 'new-checkout': true } } })
    expect(useFeatureFlags()).toEqual({ 'new-checkout': true })
  })

  it('returns an empty map when nothing is shared', () => {
    usePage.mockReturnValue({ props: {} })
    expect(useFeatureFlags()).toEqual({})
  })

  it('returns a single shared flag value', () => {
    usePage.mockReturnValue({ props: { featureFlags: { 'new-checkout': true } } })
    expect(useFlag('new-checkout', false)).toBe(true)
  })

  it('falls back to the provided default when the flag is absent', () => {
    usePage.mockReturnValue({ props: { featureFlags: {} } })
    expect(useFlag('missing', 'fallback')).toBe('fallback')
  })
})
