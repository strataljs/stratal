---
"@stratal/testing": patch
---

Add SSE testing utilities with `TestSseRequest` and `TestSseConnection`

### Details

- `TestingModule.sse(path)` creates an SSE test request builder
- `TestSseRequest` supports custom headers, authentication via `actingAs()`, and automatic `Accept: text/event-stream` header
- `TestSseConnection` wraps a live SSE stream with assertion helpers: `assertEvent()`, `assertEventData()`, `assertJsonEventData()`, `waitForEvent()`, `waitForEnd()`, `collectEvents()`
- Replace dynamic `import('vitest')` with static imports in `TestWsConnection`, `TestWsRequest`, and `TestingModule`
