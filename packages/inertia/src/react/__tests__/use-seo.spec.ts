import { describe, expect, it, vi } from 'vitest'

const usePage = vi.fn()
vi.mock('@inertiajs/react', () => ({ usePage: () => usePage() }))

const { useSeo } = await import('../seo')

describe('useSeo', () => {
  it('returns the shared seo prop', () => {
    usePage.mockReturnValue({ props: { seo: { title: 'X' } } })
    expect(useSeo()).toEqual({ title: 'X' })
  })

  it('returns an empty object when no seo prop is shared', () => {
    usePage.mockReturnValue({ props: {} })
    expect(useSeo()).toEqual({})
  })
})
