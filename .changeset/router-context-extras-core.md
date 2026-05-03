---
"stratal": patch
---

Add Cloudflare request properties and full-record access on `RouterContext`

- New `ctx.cf` getter exposes Cloudflare-provided request properties (geo, TLS, bot management, etc.) as `IncomingRequestCfProperties`.
- `ctx.param()` (no args) now returns the full validated param record as `Record<string, string>`. The single-key overload (`ctx.param('id')`) is unchanged. The same overload is available on `GatewayContext` for WebSocket gateways.
