---
"@stratal/inertia-modal": patch
---

Add `nativeBack` support to modal navigation and eagerly resolve deferred props in background page fetches

- `useModal().redirect()` now uses `history.back()` instead of a server round-trip when the modal was loaded via a partial reload, providing instant close behavior.
- Background page fetches send `x-inertia-resolve-deferred: true` to ensure deferred props are included in the response.
