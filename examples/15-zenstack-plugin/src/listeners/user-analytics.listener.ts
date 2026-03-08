import type { EventContext } from 'stratal/events'
import { Listener, On } from 'stratal/events'
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

@Listener()
export class UserAnalyticsListener {
  constructor(
    @InjectDB('analytics') private readonly analytics: DatabaseService<'analytics'>,
  ) {}

  @On('after.User.create')
  async onUserCreated(context: EventContext<'after.User.create'>) {
    console.log('[UserAnalyticsListener] User created, recording signup event')
    await this.analytics.event.create({
      data: {
        name: 'user.signup',
        payload: JSON.stringify({ userId: context.result.id }),
        userId: context.result.id,
      },
    })
  }

  @On('after.Post.create')
  async onPostCreated(context: EventContext<'after.Post.create'>) {
    console.log('[UserAnalyticsListener] Post created, recording event')
    await this.analytics.event.create({
      data: {
        name: 'post.created',
        payload: JSON.stringify({ postId: context.result.id }),
        userId: context.result.userId,
      },
    })
  }
}
