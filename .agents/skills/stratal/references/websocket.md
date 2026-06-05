# WebSocket Gateways

Real-time endpoints with DI access. Gateways register like controllers and use Hono's WebSocket helper under the hood.

## Define a Gateway

Mark a class with `@Gateway(path, options?)` and add `@Transient()`. Gateways are registered in a module's `controllers` array (the same place as HTTP controllers — they share the controller pipeline so middleware, guards, domain matching, and versioning all apply).

```typescript
// src/domain/chat/chat.gateway.ts
import { Transient } from 'stratal/di'
import { Gateway, OnMessage, OnClose, OnError, type GatewayContext } from 'stratal/websocket'

@Transient()
@Gateway('/ws/chat')
export class ChatGateway {
  @OnMessage()
  handleMessage(evt: MessageEvent, ctx: GatewayContext) {
    const data = typeof evt.data === 'string' ? evt.data : ''
    ctx.send(`echo: ${data}`)
  }

  @OnClose()
  handleClose(evt: CloseEvent, ctx: GatewayContext) {
    // cleanup
  }

  @OnError()
  handleError(evt: Event, ctx: GatewayContext) {
    // log
  }
}
```

```typescript
// src/domain/chat/chat.module.ts
import { Module } from 'stratal/module'
import { ChatGateway } from './chat.gateway'

@Module({ controllers: [ChatGateway] })
export class ChatModule {}
```

One handler per event per gateway. Decorating two methods with the same `@OnMessage()` (or `@OnClose`, `@OnError`) throws `WebSocketDuplicateEventHandlerError` at registration.

## `@Gateway` Options

```typescript
@Gateway('/ws/chat', {
  version: '1',                 // string | string[] | typeof VERSION_NEUTRAL
  name: 'chat',                 // route name (for `route('chat', ...)`)
  domain: '{tenant}.app.com',   // domain pattern
})
```

Versioning, naming, and domain matching behave the same as on `@Controller`.

## `GatewayContext` API

Inherits from `RouterContext`. Use these inside event handlers:

| Method | Purpose |
|---|---|
| `ctx.send(data)` | Send `string`, `ArrayBuffer`, or `Uint8Array` to the client. |
| `ctx.close(code?, reason?)` | Close the connection. |
| `ctx.readyState` | `WSReadyState` (`CONNECTING`, `OPEN`, `CLOSING`, `CLOSED`). |
| `ctx.ws` | Underlying Hono `WSContext` for advanced operations. |
| `ctx.param(key)` | Route param from the upgrade request (`/ws/chat/:room`). |
| `ctx.query(key?)` | Query param from the upgrade request. |
| `ctx.header(key)` | Header from the upgrade request. |
| `ctx.getContainer()` | Request-scoped DI container — `resolve(MyService)` etc. |
| `ctx.getLocale()` | Resolved locale from i18n detection. |

`ctx.body()` throws `WebSocketBodyNotAvailableError` — upgrade requests have no body.

## Authenticating WebSocket Connections

Apply guards on the gateway class — the check runs against the upgrade request's headers/cookies before the connection is accepted.

```typescript
import { Transient } from 'stratal/di'
import { UseGuards } from 'stratal/guards'
import { Gateway, OnMessage, type GatewayContext } from 'stratal/websocket'
import { AuthGuard } from '@stratal/framework/guards'

@Transient()
@UseGuards(AuthGuard())
@Gateway('/ws/chat')
export class ChatGateway {
  @OnMessage()
  handleMessage(evt: MessageEvent, ctx: GatewayContext) {
    const userId = ctx.getContainer().resolve(AuthContext).requireUserId()
    ctx.send(`hello ${userId}`)
  }
}
```

## Errors

| Error | When |
|---|---|
| `WebSocketDuplicateEventHandlerError` | Two methods on the same gateway have the same `@On*` decorator. |
| `WebSocketBodyNotAvailableError` | A handler called `ctx.body()` (not supported on WS). |

Both extend `ApplicationError` and ship with i18n keys, so they integrate with the standard `ExceptionHandler` flow.

## Testing

For test patterns (`TestWsRequest`, `TestWsConnection`), see `references/testing.md` "WebSocket Testing".

## Sub-Path Import

`stratal/websocket` — `Gateway`, `OnMessage`, `OnClose`, `OnError`, `GatewayContext`, `GatewayOptions`, error classes, plus re-exported `WSContext`, `WSEvents`, `WSMessageReceive`, `WSReadyState` from `hono/ws`.
