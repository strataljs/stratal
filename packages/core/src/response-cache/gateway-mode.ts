/**
 * Contexts that Stratal itself dispatched as the **gateway** entrypoint.
 *
 * The gateway and the cached entrypoint run the *same* Hono app, so the
 * dispatch middleware needs to know which of the two it is running inside. That
 * signal must not be forgeable: a header, a query parameter, or a value read
 * out of `ctx.props` is all attacker-influenced, and getting it wrong in the
 * cached entrypoint means an infinite loopback; getting it wrong in the gateway
 * means a partitioned response served from the wrong entrypoint's cache.
 *
 * So the mark lives here, in a module-private `WeakSet`, keyed on the
 * `ExecutionContext` object the runtime handed to `Stratal.fetch`. Nothing
 * reachable from a request can add to it, and entries are collected with the
 * context they mark.
 *
 * A `WeakSet` rather than a symbol property on a wrapper object, which is what
 * the design sketched, for two reasons:
 *
 * - `ExecutionContext` is a host object with `readonly exports`, `readonly
 *   props`, `cache`, `access`, and `tracing`. Re-creating it as a literal means
 *   enumerating those members by hand and silently dropping whichever ones the
 *   runtime adds next; eagerly reading `exports` in the wrapper would also
 *   throw on any Worker without the `enable_ctx_exports` compatibility flag,
 *   i.e. every app that doesn't use this feature.
 * - Assigning a symbol onto the runtime's own object mutates something we don't
 *   own, and throws outright under ESM strict mode if it is ever frozen.
 *
 * The `WeakSet` needs neither: the context passes through untouched.
 */
const GATEWAY_CONTEXTS = new WeakSet<object>()

/**
 * Mark an execution context as running in gateway mode.
 *
 * Called by `Stratal.fetch` (the default export — the eyeball entrypoint) and
 * by `@stratal/testing`, which drives `HonoApp#fetch` directly. Deliberately
 * **not** called by `cachedEntrypoint`, which is what stops the cached
 * entrypoint from dispatching back into itself.
 *
 * Returns the same object it was given, so it can be used inline.
 */
export function markGatewayMode<T extends object>(ctx: T): T {
  GATEWAY_CONTEXTS.add(ctx)
  return ctx
}

/** Whether this execution context was marked by {@link markGatewayMode}. */
export function isGatewayMode(ctx: unknown): boolean {
  return typeof ctx === 'object' && ctx !== null && GATEWAY_CONTEXTS.has(ctx)
}
