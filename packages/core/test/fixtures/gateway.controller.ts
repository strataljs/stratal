import { Module } from '../../src/module/module.decorator'
import { Gateway } from '../../src/websocket/decorators/gateway.decorator'
import { OnClose, OnError, OnMessage } from '../../src/websocket/decorators/ws-event.decorator'
import type { GatewayContext } from '../../src/websocket/gateway-context'

@Gateway('/ws/chat')
export class ChatGateway {
  @OnMessage()
  handleMessage(evt: MessageEvent, ctx: GatewayContext) {
    ctx.send(`echo:${evt.data as string}`)
  }

  @OnClose()
  handleClose(_evt: CloseEvent, _ctx: GatewayContext) {
    // noop
  }

  @OnError()
  handleError(_evt: Event, _ctx: GatewayContext) {
    // noop
  }
}

@Gateway('/ws/no-close')
export class NoCloseGateway {
  @OnMessage()
  handleMessage(evt: MessageEvent, ctx: GatewayContext) {
    ctx.send(`echo:${evt.data as string}`)
  }
}

@Module({
  controllers: [ChatGateway, NoCloseGateway],
})
export class GatewayAppModule { }
