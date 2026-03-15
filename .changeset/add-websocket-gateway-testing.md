---
"@stratal/testing": patch
---

Add WebSocket testing utilities with `TestWsRequest` and `TestWsConnection`

### Details

- `TestingModule.ws(path)` creates a WebSocket test request builder
- `TestWsRequest` supports custom headers, authentication via `actingAs()`, and WebSocket upgrade handshake
- `TestWsConnection` wraps a live WebSocket with assertion helpers: `assertMessage()`, `assertClosed()`, `waitForMessage()`, `waitForClose()`
