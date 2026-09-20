// Telling the server which levels the client has open.
//
// On the router rather than at this package's own visit sites, because the visits that most need it
// are the application's: a plain `<Link>`, a `router.visit` after a submit. No scheme inside the
// package reaches those, and a header a consumer has to add by hand is one a consumer forgets — the
// level it is forgotten on closes onto a sheet again, silently, with every test still green.
import { interceptors } from '@inertiajs/core'
import type { HttpRequestConfig } from '@inertiajs/core'

import { encodeHeldLevels, MODAL_HELD_HEADER } from '../core/wire'
import { readHeldStack } from './stack-store'

// This package targets Workers and deliberately omits the DOM lib, so `document` is not a known
// global. Its presence is the only thing asked of it here.
declare const document: object | undefined

/**
 * `config` carrying the levels the client has open.
 *
 * The visit is not consulted, and is typed as `unknown` to say so: what the client holds is a
 * property of the client, not of whichever visit happens to be leaving.
 *
 * Read here, as the request is built, rather than closed over: the stack changes with every
 * response, and a value captured earlier would describe it as it was one level ago.
 */
export function nameHeldLevels(_visit: unknown, config: HttpRequestConfig): HttpRequestConfig {
  return {
    ...config,
    headers: {
      ...config.headers,
      [MODAL_HELD_HEADER]: encodeHeldLevels(readHeldStack().map((level) => level.url)),
    },
  }
}

let installed = false

/**
 * Starts naming the open levels on every visit the router makes.
 *
 * Idempotent, and installed from the resolver rather than at module scope so importing this package
 * has no side effect. A server never installs it: the held stack is client-only state, and a
 * request interceptor registered in an isolate would read one visitor's sheets while answering
 * another's.
 */
export function installHeldHeader(): void {
  if (installed || typeof document === 'undefined') return
  installed = true

  interceptors.onVisitRequest(nameHeldLevels)
}
