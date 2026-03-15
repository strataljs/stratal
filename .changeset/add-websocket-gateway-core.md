---
"stratal": patch
---

Add WebSocket gateway support with `@Gateway`, `@OnMessage`, `@OnClose`, and `@OnError` decorators

### Details

- `@Gateway(path, options?)` decorator marks a class as a WebSocket gateway, reusing controller route metadata for middleware compatibility. Accepts optional `GatewayOptions` with `version` support (single, array, or `VERSION_NEUTRAL`)
- `@OnMessage()`, `@OnClose()`, `@OnError()` method decorators wire handler methods to WebSocket events
- `GatewayContext` extends `RouterContext` with WebSocket-specific methods (`send()`, `close()`, `readyState`)
- `GatewayContext` overrides `param()` and `query()` to use raw Hono request methods (no OpenAPI validation for WebSocket upgrade requests)
- `GatewayContext.body()` throws `WebSocketBodyNotAvailableError` — WebSocket upgrade requests have no body
- Gateways support versioning and class-level guards
- New `stratal/websocket` sub-path export with `GatewayOptions` type
