import { z } from '../../src/i18n/validation'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Get } from '../../src/router/decorators/http-method.decorator'
import type { RouterContext } from '../../src/router/router-context'

@Controller('/streaming')
export class StreamingController {
  @Get('/stream', { response: { schema: z.any(), contentType: 'application/octet-stream' } })
  stream(ctx: RouterContext) {
    return ctx.stream(async (stream) => {
      await stream.write(new Uint8Array([72, 101, 108, 108, 111]))
    })
  }

  @Get('/stream-error', { response: { schema: z.any(), contentType: 'application/octet-stream' } })
  streamError(ctx: RouterContext) {
    return ctx.stream(
      () => {
        throw new Error('stream error')
      },
      async (err, stream) => {
        await stream.writeln(err.message)
        await stream.close()
      }
    )
  }

  @Get('/text', { response: { schema: z.any(), contentType: 'text/plain' } })
  text(ctx: RouterContext) {
    return ctx.streamText(async (stream) => {
      await stream.write('hello ')
      await stream.write('world')
    })
  }

  @Get('/sse', { response: { schema: z.any(), contentType: 'text/event-stream' } })
  sse(ctx: RouterContext) {
    return ctx.streamSSE(async (stream) => {
      await stream.writeSSE({ data: 'hello', event: 'message', id: '1' })
    })
  }
}

@Module({
  controllers: [StreamingController],
})
export class StreamingAppModule {}
