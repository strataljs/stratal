---
"stratal": patch
---

Add `trailingSlash` application option for canonical URL handling

A new `trailingSlash` field on `ApplicationConfig` controls how incoming paths and generated URLs handle a trailing `/`:

- `'ignore'` (default) — both `/foo` and `/foo/` resolve to the same route; URL helpers leave paths unchanged.
- `'always'` — non-trailing requests are 308-redirected to the trailing-slash form; URL helpers append `/`. Paths whose last segment looks file-like (e.g. `/api/openapi.json`) are skipped.
- `'never'` — trailing requests are 308-redirected to the non-trailing form; URL helpers strip a single trailing `/`.

`Uri.to()`, `Uri.url()`, `Uri.current()`, `Uri.full()`, and the global `route()` helper all apply the configured mode. 308 preserves request method and body, and `Location` headers are emitted as path-relative URIs to avoid mixed-content issues behind HTTPS-terminating proxies.
