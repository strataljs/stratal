import { Controller, IController, InjectQueue, type IQueueSender, Route, RouterContext } from 'stratal';
import { z } from 'stratal/validation';

@Controller('/api/notifications')
export class NotificationsController implements IController {
  constructor(
    @InjectQueue('notifications-queue') private readonly queue: IQueueSender,
  ) { }

  @Route({
    body: z.object({
      to: z.string().email(),
      subject: z.string(),
      body: z.string(),
    }),
    response: z.object({ queued: z.boolean() }),
    summary: 'Queue a notification',
  })
  async create(ctx: RouterContext) {
    const payload = await ctx.body<{ to: string; subject: string; body: string }>()

    await this.queue.dispatch({
      type: 'notification.send',
      payload,
    })

    return ctx.json({ queued: true }, 201)
  }
}
