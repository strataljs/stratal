import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@inertiajs/core'
import { createElement } from 'react'
import { createInertiaSsrApp } from '../ssr'

function createPage(): Page {
  return {
    component: 'Home',
    props: { message: 'Hello', errors: {} },
    url: '/',
    version: null,
    flash: {},
    rememberedState: {},
    rescuedProps: [],
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (; ;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out + decoder.decode()
}

const Home = ({ message }: { message: string }) => createElement('h1', null, message)

describe('createInertiaSsrApp', () => {
  it('returns a render() that resolves the component and yields { head, stream }', async () => {
    const resolve = vi.fn().mockResolvedValue({ default: Home })
    const { render } = createInertiaSsrApp({ resolve })

    const result = await render(createPage())

    expect(resolve).toHaveBeenCalledWith('Home')
    expect(Array.isArray(result.head)).toBe(true)
    const html = await readAll(result.stream)
    expect(html).toContain('Hello')
  })

  it('supports a setup wrapper for providers', async () => {
    const setup = vi.fn(({ App, props }) => createElement(App, props))
    const { render } = createInertiaSsrApp({ resolve: () => Home, setup })

    const result = await render(createPage())
    const html = await readAll(result.stream)

    expect(setup).toHaveBeenCalledOnce()
    expect(html).toContain('Hello')
  })

  it('renders a bare (non-default-exported) component', async () => {
    const { render } = createInertiaSsrApp({ resolve: () => Home })

    const html = await readAll((await render(createPage())).stream)

    expect(html).toContain('Hello')
  })

  it('throws when the resolver yields no component instead of rendering nothing', async () => {
    const { render } = createInertiaSsrApp({ resolve: () => ({ default: undefined }) })

    await expect(render(createPage())).rejects.toThrow(/did not return a React component/)
  })
})
