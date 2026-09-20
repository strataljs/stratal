/**
 * Requests the application dispatched into its own router while another
 * request was already running.
 *
 * A nested dispatch is not an eyeball request, and the difference is not
 * cosmetic: it exists to render something the caller asked for *indirectly*,
 * so a route is entitled to answer it differently — that is the whole point of
 * one, and the reason a route can recognise it at all. Its response is
 * therefore not the response the same URL would give a client, and anything
 * that stores responses by URL must never see it.
 *
 * The mark lives in a module-private `WeakSet` keyed on the `Request` object,
 * for the reasons `markGatewayMode` uses one for the `ExecutionContext`:
 * nothing reachable from a request can add to it, so it cannot be forged the
 * way a header or a query parameter can. Keyed on the request rather than on
 * the context because a nested dispatch shares the outer request's execution
 * context — it needs the same `waitUntil` and the same bindings — and one
 * `Request` is one dispatch.
 */
const NESTED_DISPATCHES = new WeakSet<Request>()

/**
 * Mark a request as dispatched into this app from inside another request.
 *
 * Returns the same object it was given, so it can be used inline.
 */
export function markNestedDispatch(request: Request): Request {
  NESTED_DISPATCHES.add(request)
  return request
}

/** Whether this request was marked by {@link markNestedDispatch}. */
export function isNestedDispatch(request: Request): boolean {
  return NESTED_DISPATCHES.has(request)
}
