/// <reference lib="dom" />
import { act, createElement } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const usePage = vi.fn()
vi.mock('@inertiajs/react', () => ({ usePage: () => usePage() }))

const { Seo } = await import('../seo')

let container: HTMLElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  document.head.innerHTML = ''
  document.title = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('<Seo/>', () => {
  it('injects head tags from the shared seo prop on mount', () => {
    usePage.mockReturnValue({ props: { seo: { title: 'Home', description: 'Welcome' } } })
    act(() => root.render(createElement(Seo)))

    expect(document.title).toBe('Home')
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Welcome')
  })

  it('reconciles the head when the seo prop changes (no duplicates)', () => {
    usePage.mockReturnValue({ props: { seo: { title: 'A', description: 'first' } } })
    act(() => root.render(createElement(Seo)))

    usePage.mockReturnValue({ props: { seo: { title: 'B', description: 'second' } } })
    act(() => root.render(createElement(Seo)))

    expect(document.title).toBe('B')
    const metas = document.head.querySelectorAll('meta[name="description"]')
    expect(metas).toHaveLength(1)
    expect(metas[0].getAttribute('content')).toBe('second')
  })

  it('renders no DOM of its own', () => {
    usePage.mockReturnValue({ props: { seo: {} } })
    act(() => root.render(createElement(Seo)))
    expect(container.innerHTML).toBe('')
  })
})
