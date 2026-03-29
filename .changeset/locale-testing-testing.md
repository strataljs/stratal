---
"@stratal/testing": patch
---

Add locale support to test HTTP client, SSE, and WebSocket requests

### Details

- Add `withLocale()` method to `TestHttpClient`, `TestHttpRequest`, `TestSseRequest`, and `TestWsRequest`
- Automatically resolves locale detection strategy from the module's I18n configuration
- Export `getValueAtPath` and `hasValueAtPath` path utility functions
