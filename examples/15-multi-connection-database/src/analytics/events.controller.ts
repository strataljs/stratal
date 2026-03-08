import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

import {
  eventListSchema,
  eventResponseSchema,
  recordEventSchema,
} from './analytics.schemas'

@Controller('/api/analytics/events')
export class EventsController implements IController {
  constructor(
    @InjectDB('analytics') private readonly db: DatabaseService<'analytics'>,
  ) {}

  @Route({
    response: eventListSchema,
    summary: 'List events',
  })
  async index(ctx: RouterContext) {
    const events = await this.db.event.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return ctx.json({ data: events })
  }

  @Route({
    body: recordEventSchema,
    response: eventResponseSchema,
    summary: 'Record an event',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ name: string; payload?: string; userId?: string }>()
    const event = await this.db.event.create({ data: body })
    return ctx.json({ data: event }, 201)
  }
}
