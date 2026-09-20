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
    ? (module).default
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

/**
 * The declared options of {@link createInertiaSsrApp}, before `prepare`'s
 * presence requirement is applied. Every inference site for `TProps` and
 * `TPrepared` lives here, in plain (non-conditional) positions.
 */
export interface InertiaSsrAppOptions<TProps = unknown, TPrepared = undefined> {
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
   * Compute a per-render value before the tree is built, and receive it back in
   * `setup`. Runs once per `render(page)` call. Required whenever `setup` expects
   * a `prepared` other than `undefined` — see {@link CreateInertiaSsrAppOptions}.
   *
   * This exists so a request-scoped value — resolved modal components, a request
   * logger — can reach the tree without a module-level variable. A worker isolate
   * serves many requests concurrently and interleaves them at every await, so a
   * module-level "current request" value is a cross-request leak, not a shortcut.
   */
  prepare?: (page: Page) => TPrepared | Promise<TPrepared>
  /**
   * Optional wrapper for application-level providers (theme, store, i18n, …).
   * Receives the Inertia `App` component, its props, and this render's `prepare`
   * result. Return the React tree to render. When omitted, `App` is rendered
   * directly.
   */
  // Declared as a property with a function type, never method shorthand: only the
  // property form is checked contravariantly under `strictFunctionTypes`, so an
  // annotated `prepared` here is an inference site for `TPrepared` rather than a
  // bivariantly-accepted lie.
  setup?: (args: { App: ComponentType<AppProps>; props: AppProps; prepared: TPrepared }) => ReactNode
  /**
   * Optional document-title callback (Inertia `title`), applied to page titles.
   */
  title?: HeadManagerTitleCallback
}

/**
 * Options for {@link createInertiaSsrApp}.
 *
 * `TPrepared` is inferred from `prepare`'s return type *and* from an annotated
 * `prepared` on `setup`. The intersected member closes the gap between the two:
 * unless `TPrepared` is `undefined`, `prepare` becomes required, so a `setup`
 * that claims a `prepared` nothing produces fails to compile instead of reading
 * `undefined` at runtime. The requirement is expressed as an intersection rather
 * than a union of two option shapes because a union is discriminated only by
 * literal-valued properties — `prepare` holds a function, so a union would leave
 * `setup`'s parameters without a contextual type.
 */
export type CreateInertiaSsrAppOptions<TProps = unknown, TPrepared = undefined> =
  InertiaSsrAppOptions<TProps, TPrepared> &
    ([undefined] extends [TPrepared] ? unknown : Pick<Required<InertiaSsrAppOptions<TProps, TPrepared>>, 'prepare'>)

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
export function createInertiaSsrApp<TProps = unknown, TPrepared = undefined>(
  options: CreateInertiaSsrAppOptions<TProps, TPrepared>,
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
      const [initialComponent, prepared] = await Promise.all([
        resolveComponent(page.component),
        // Awaiting a `TPrepared | Promise<TPrepared>` yields `Awaited<TPrepared>`,
        // which is `TPrepared` itself: inference against that union prefers the
        // `Promise<TPrepared>` constituent over the naked one, so `TPrepared` is
        // never a promise. The `?.` short-circuit only stands in for a `TPrepared`
        // of `undefined`, because the options type requires `prepare` for any
        // other `TPrepared`.
        Promise.resolve(options.prepare?.(page)) as Promise<TPrepared>,
      ])
      const props: AppProps = {
        initialPage: page,
        initialComponent,
        resolveComponent,
        titleCallback: options.title,
        onHeadUpdate: (elements: string[]) => { head = elements },
      }
      const app = options.setup
        ? options.setup({ App, props, prepared })
        : createElement(App, props)
      const stream = await renderToReadableStream(app)
      return { head, stream }
    },
  }
}
