---
"stratal": patch
---

Add precognition request validation, a safe WebSocket send, and cron misconfiguration warnings

- **Precognition** — send a `Precognition: true` header to run a route's validators (across all parameters, including localized/prefixed routes) and get a `204` without executing the handler, enabling live form validation.
- **`trySend()`** — gateways can now send a WebSocket message only when the socket is open, returning `false` instead of throwing for closed connections.
- A warning is now logged when a cron job is registered without a `schedule`, instead of silently skipping it.
