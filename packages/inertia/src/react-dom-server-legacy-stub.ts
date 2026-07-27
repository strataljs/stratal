/**
 * Removes react-dom's legacy synchronous server renderer from the worker SSR bundle.
 *
 * `react-dom/server` (workerd → `server.edge.js`) `require()`s two independent
 * builds: the streaming `react-dom-server.edge` (exposes `renderToReadableStream`,
 * the only renderer Stratal uses — see `ssr.ts`) and the synchronous
 * `react-dom-server-legacy.browser` (`renderToString` / `renderToStaticMarkup`).
 * The CJS `require` defeats tree-shaking, so the unused legacy build ships ~200 KB
 * raw / ~40 KB gzip of dead code. The `stratalInertia()` Vite plugin aliases the
 * legacy build to this module so it never reaches the worker.
 *
 * Stratal renders exclusively with `renderToReadableStream`; the synchronous
 * renderer is not supported in the worker. These exports exist only because
 * `server.edge.js` reads them at load time — calling them throws.
 */

function removed(api: string): never {
  throw new Error(
    `[@stratal/inertia] react-dom/server.${api} is not available in the worker SSR build — ` +
      `Stratal renders with renderToReadableStream.`,
  )
}

export const renderToString = (): never => removed('renderToString')
export const renderToStaticMarkup = (): never => removed('renderToStaticMarkup')
