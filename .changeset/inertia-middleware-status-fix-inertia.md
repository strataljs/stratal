---
"@stratal/inertia": patch
---

Skip response mutation for non-cloneable status codes

The Inertia middleware would crash with a `RangeError` when the downstream handler returned a response whose status fell outside `200-599` (e.g. WebSocket upgrades using `101`, or `Response.error()`'s status `0`), because adding the `Vary` header forces Hono to re-construct the `Response` and the constructor rejects those statuses. The middleware now passes such responses through untouched. The `302 → 303` rewrite for non-GET/HEAD Inertia requests is now scoped to only run when the status is exactly `302`.
