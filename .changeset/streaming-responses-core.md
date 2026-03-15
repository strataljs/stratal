---
"stratal": patch
---

Add streaming response methods (`stream`, `streamText`, `streamSSE`) to RouterContext

### Details

- `stream()` — generic/binary streaming via Hono's `stream` helper
- `streamText()` — text streaming with automatic `Content-Encoding: Identity` for Cloudflare Workers compatibility
- `streamSSE()` — Server-Sent Events streaming with automatic `Content-Encoding: Identity` for Cloudflare Workers compatibility
- Re-export `StreamingApi`, `SSEStreamingApi`, and `SSEMessage` types from `stratal/router`
