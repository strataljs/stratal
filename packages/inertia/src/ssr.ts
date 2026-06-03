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
// Import `App` as a runtime value only — never reference its *type*
// (`typeof App`, `Parameters<typeof App>`, `ComponentProps<typeof App>`, …) in
// this module's exported surface. Any such reference makes the emitted `.d.mts`
// re-export `import { App } from '@inertiajs/react'`, which pulls Inertia's whole
// type graph into resolution the moment a consumer imports this SSR entry. That
// eagerly evaluates `@inertiajs/core`'s config-driven types (`FlashData`,
// `SharedPageProps`, derived from its `InertiaConfig` interface) before a
// consumer's own `declare module '@inertiajs/core'` augmentation has been
// applied, caching the un-augmented defaults — so `usePage().flash` /
// `usePage().props` degrade to `unknown` at call sites. Typing this entry's
// surface structurally (below) keeps `@inertiajs/react` out of the generated
// declarations and avoids the hazard.
import { App } from '@inertiajs/react'
import { type ComponentType, type ReactNode, createElement } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import { ApplicationError } from 'stratal/errors'
import type { InertiaSsrResult } from './types'

/**
 * The props Inertia's `App` component receives, reconstructed locally from
 * `@inertiajs/core` + React types. Mirrors `@inertiajs/react`'s `InertiaAppProps`
 * without importing it — see the `App` import note above for why that matters.
 */
interface AppProps {
  initialPage: Page
  // `ComponentType<any>` mirrors Inertia's own `ReactComponent` (page components
  // are resolved opaquely), keeping the resolver's `ComponentType<TProps>` output
  // assignable here without coupling to `@inertiajs/react`'s exported types.
  // oxlint-disable-next-line typescript/no-explicit-any
  initialComponent?: ComponentType<any>
  // oxlint-disable-next-line typescript/no-explicit-any
  resolveComponent?: (name: string, page?: Page) => ComponentType<any> | Promise<ComponentType<any>>
  titleCallback?: HeadManagerTitleCallback
  onHeadUpdate?: (elements: string[]) => void
}

/** A page component for `TProps`, or a module namespace whose `default` is one. */
type ResolvedPage<TProps> = ComponentType<TProps> | { default: ComponentType<TProps> }

/**
 * The resolver's return type, keyed on whether a props type argument was supplied:
 * with none (`TProps` defaults to `unknown`) it stays opaque — matching what
 * `import.meta.glob` yields — and with one it is the typed component/module.
 */
type ResolverReturn<TProps> = [unknown] extends [TProps]
  ? unknown
  : ResolvedPage<TProps> | Promise<ResolvedPage<TProps>>

/** Unwrap a module namespace's `default` export, leaving a bare component as-is. */
function unwrapDefault(module: unknown): unknown {
  return typeof module === 'object' && module !== null && 'default' in module
    ? (module as { default: unknown }).default
    : module
}

/**
 * A React component is either a function (function/class component) or an object
 * (a `memo`/`forwardRef`/`lazy` exotic component). This narrows the opaque value a
 * dynamic import yields without admitting `any`.
 */
function isPageComponent<TProps>(value: unknown): value is ComponentType<TProps> {
  return typeof value === 'function' || (typeof value === 'object' && value !== null)
}

export interface CreateInertiaSsrAppOptions<TProps = unknown> {
  /**
   * Resolve a page by name. Typically backed by `import.meta.glob`, whose modules
   * are opaque (`unknown`) — the returned value is unwrapped (a `default` export is
   * taken when present) and narrowed to a component at runtime, so an invalid
   * resolver result fails loudly rather than rendering nothing. Pass a props type
   * argument to {@link createInertiaSsrApp} to type the resolver's return.
   */
  // `NoInfer` keeps `TProps` pinned to its explicit type argument (or the
  // `unknown` default) instead of being widened back out of the resolver return.
  resolve: (name: string) => ResolverReturn<NoInfer<TProps>>
  /**
   * Optional wrapper for application-level providers (theme, store, i18n, …).
   * Receives the Inertia `App` component and its props; return the React tree to
   * render. When omitted, `App` is rendered directly.
   */
  setup?: (args: { App: ComponentType<AppProps>; props: AppProps }) => ReactNode
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
export function createInertiaSsrApp<TProps = unknown>(
  options: CreateInertiaSsrAppOptions<TProps>,
): InertiaSsrApp {
  const resolveComponent = (name: string): Promise<ComponentType<TProps>> =>
    Promise.resolve(options.resolve(name)).then((module) => {
      const component = unwrapDefault(module)
      if (!isPageComponent<TProps>(component)) {
        throw new ApplicationError(`[stratal:inertia] resolve("${name}") did not return a React component.`)
      }
      return component
    })

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
