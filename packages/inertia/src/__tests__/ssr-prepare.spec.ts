import type { Page } from '@inertiajs/core'
import { createElement } from 'react'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createInertiaSsrApp } from '../ssr'

const page = { component: 'Home', props: {}, url: '/', version: '1' } as unknown as Page
const Home = () => createElement('main', {}, 'home')

async function read(stream: ReadableStream): Promise<string> {
  return new Response(stream).text()
}

describe('createInertiaSsrApp prepare', () => {
  it('passes each render its own prepared value', async () => {
    const seen: string[] = []
    const app = createInertiaSsrApp<unknown, string>({
      resolve: () => Home,
      prepare: (p) => `prepared:${p.url}`,
      setup: ({ App, props, prepared }) => {
        seen.push(prepared)
        return createElement(App, props)
      },
    })

    await app.render(page)
    await app.render({ ...page, url: '/second' })

    expect(seen).toEqual(['prepared:/', 'prepared:/second'])
  })

  it('still renders when no prepare is given', async () => {
    const app = createInertiaSsrApp({ resolve: () => Home })
    const { stream } = await app.render(page)
    expect(await read(stream)).toContain('home')
  })

  it('rejects render when prepare throws synchronously', async () => {
    const app = createInertiaSsrApp({
      resolve: () => Home,
      prepare: () => {
        throw new Error('prepare failed')
      },
    })

    await expect(app.render(page)).rejects.toThrow('prepare failed')
  })

  it('rejects render when prepare returns a rejected promise', async () => {
    const app = createInertiaSsrApp({
      resolve: () => Home,
      prepare: () => Promise.reject(new Error('prepare rejected')),
    })

    await expect(app.render(page)).rejects.toThrow('prepare rejected')
  })
})

interface Session {
  token: string
}

describe('createInertiaSsrApp prepared typing', () => {
  it('infers the prepared type from prepare and hands it to setup', async () => {
    let seen: Session | undefined
    const app = createInertiaSsrApp({
      resolve: () => Home,
      prepare: (): Session => ({ token: 'sync' }),
      setup: ({ App, props, prepared }) => {
        expectTypeOf(prepared).toEqualTypeOf<Session>()
        seen = prepared
        return createElement(App, props)
      },
    })

    await app.render(page)

    expect(seen).toEqual({ token: 'sync' })
  })

  it('infers the awaited prepared type from an async prepare', async () => {
    let seen: Session | undefined
    const app = createInertiaSsrApp({
      resolve: () => Home,
      prepare: (): Promise<Session> => Promise.resolve({ token: 'async' }),
      setup: ({ App, props, prepared }) => {
        expectTypeOf(prepared).toEqualTypeOf<Session>()
        seen = prepared
        return createElement(App, props)
      },
    })

    await app.render(page)

    expect(seen).toEqual({ token: 'async' })
  })

  it('hands setup `undefined` when no prepare is supplied', async () => {
    let seen: unknown = 'untouched'
    const app = createInertiaSsrApp({
      resolve: () => Home,
      setup: ({ App, props, prepared }) => {
        expectTypeOf(prepared).toEqualTypeOf<undefined>()
        seen = prepared
        return createElement(App, props)
      },
    })

    await app.render(page)

    expect(seen).toBeUndefined()
  })

  // The regression guard for the hole this shape closes: `prepared` used to take
  // its type from `setup` alone, so a `setup` reading a value no `prepare`
  // produces compiled and then read `undefined` at runtime.
  it('rejects a setup expecting a prepared value when no prepare is supplied', () => {
    // @ts-expect-error - `prepared` is only inhabited when `prepare` produces it
    const app = createInertiaSsrApp({
      resolve: () => Home,
      setup: ({ prepared }: { App: unknown; props: unknown; prepared: Session }) =>
        createElement('div', null, prepared.token),
    })

    expect(app.render).toBeTypeOf('function')
  })
})
