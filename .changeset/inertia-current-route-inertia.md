---
"@stratal/inertia": patch
---

Expose the matched route on `useRoute()` and apply trailing-slash + sticky params

The `routes` Inertia shared prop now also carries a `route` snapshot for the current request (`{ name, params, defaults }`) and the application's `trailingSlash` mode, enabling several `useRoute()` enhancements:

- `currentRoute` is returned alongside `route` and `current`, so components can read the matched route name and params directly (e.g. `currentRoute.params.id`).
- `current(name)` now accepts dotted wildcard patterns derived from real route names (e.g. `current('users.*')`), strictly typed against `StratalRouteMap`.
- `route(name, params)` merges sticky defaults from `Uri.defaults()` and any current-route params declared by the target route, so values like `tenantId` carry over without the caller passing them. Explicit params still win.
- Generated URLs respect the server's `trailingSlash` mode.
- Catch-all path params (e.g. `:slug{.+}`) preserve forward slashes when encoded, matching the server-side behavior.

Also exports `resolveUrl`, `matchCurrent`, and `applyTrailingSlash` as pure helpers for non-React callers and tests.
