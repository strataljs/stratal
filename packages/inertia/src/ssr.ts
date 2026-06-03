/**
 * Server-side rendering entry for Stratal Inertia.
 *
 * Provides {@link createInertiaSsrApp}, which encapsulates React 19 streaming SSR
 * (`renderToReadableStream`) and Inertia's head collection, returning the
 * `render(page)` function the `InertiaModule` SSR bundle option expects.
 *
 * This entry pulls React + `react-dom/server` into the worker SSR bundle and is
 * intentionally separate from the client (`./react`) and server (`.`) entries.
 *
 * @packageDocumentation
 */

import type { HeadManagerTitleCallback, Page } from '@inertiajs/core'
import { App } from '@inertiajs/react'
import { type ComponentType, type ReactNode, createElement } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import type { InertiaSsrResult } from './types'

// `@inertiajs/react` does not re-export its `InertiaAppProps` type, so derive it
// from the `App` component's own parameters.
type AppProps = Parameters<typeof App>[0]
/**
 * A resolved Inertia page component. Concretely typed (rather than reusing
 * `@inertiajs/react`'s `ResolvedComponent`, which is `ComponentType<any>`) so no
 * `any` leaks through the resolver into the rest of the bundle.
 */
type PageComponent = ComponentType<Record<string, unknown>>
type ResolvedModule = PageComponent | { default: PageComponent }

export interface CreateInertiaSsrAppOptions {
  /**
   * Resolve a page component by name. Typically backed by `import.meta.glob`.
   * May return the component directly or a module whose `default` is the component.
   */
  resolve: (name: string) => ResolvedModule | Promise<ResolvedModule>
  /**
   * Optional wrapper for application-level providers (theme, store, i18n, …).
   * Receives the Inertia `App` component and its props; return the React tree to
   * render. When omitted, `App` is rendered directly.
   */
  setup?: (args: { App: typeof App; props: AppProps }) => ReactNode
  /**
   * Optional document-title callback (Inertia `title`), applied to page titles.
   */
  title?: HeadManagerTitleCallback
}

export interface InertiaSsrApp {
  render(page: Page): Promise<InertiaSsrResult>
}

/**
 * Build a streaming Inertia SSR handler.
 *
 * The returned `render(page)` resolves once React's shell is ready — at which
 * point Inertia's `<Head>` tags have been collected — and streams the body
 * progressively. Head tags rendered inside a *suspended* boundary are not
 * captured; use Stratal's server-side SEO (`ctx.seo()`) for `<head>` metadata.
 */
export function createInertiaSsrApp(options: CreateInertiaSsrAppOptions): InertiaSsrApp {
  const resolveComponent = (name: string): Promise<PageComponent> =>
    Promise.resolve(options.resolve(name)).then((mod) =>
      'default' in mod ? mod.default : mod,
    )

  return {
    async render(page: Page): Promise<InertiaSsrResult> {
      let head: string[] = []
      const initialComponent = await resolveComponent(page.component)
      const props: AppProps = {
        initialPage: page,
        initialComponent,
        resolveComponent,
        titleCallback: options.title,
        onHeadUpdate: (elements: string[]) => { head = elements },
      }
      const app = options.setup
        ? options.setup({ App, props })
        : createElement(App, props)
      const stream = await renderToReadableStream(app)
      return { head, stream }
    },
  }
}
