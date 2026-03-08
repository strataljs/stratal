import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

import {
  eventCountSchema,
  eventListSchema,
  eventResponseSchema,
  pageViewListSchema,
  pageViewResponseSchema,
  recordEventSchema,
  recordPageViewSchema,
} from './analytics.schemas'

@Controller('/api/analytics')
export class AnalyticsController implements IController {
  constructor(
    @InjectDB('analytics') private readonly db: DatabaseService<'analytics'>,
  ) {}

  @Route({
    path: '/page-views',
    method: 'post',
    body: recordPageViewSchema,
    response: pageViewResponseSchema,
    summary: 'Record a page view',
  })
  async recordPageView(ctx: RouterContext) {
    const body = await ctx.body<{ path: string; userId?: string }>()
    const pageView = await this.db.pageView.create({ data: body })
    return ctx.json({ data: pageView }, 201)
  }

  @Route({
    path: '/page-views',
    response: pageViewListSchema,
    summary: 'List page views',
  })
  async pageViews(ctx: RouterContext) {
    const pageViews = await this.db.pageView.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return ctx.json({ data: pageViews })
  }

  @Route({
    path: '/events',
    method: 'post',
    body: recordEventSchema,
    response: eventResponseSchema,
    summary: 'Record an event',
  })
  async recordEvent(ctx: RouterContext) {
    const body = await ctx.body<{ name: string; payload?: string; userId?: string }>()
    const event = await this.db.event.create({ data: body })
    return ctx.json({ data: event }, 201)
  }

  @Route({
    path: '/events',
    response: eventListSchema,
    summary: 'List events',
  })
  async events(ctx: RouterContext) {
    const events = await this.db.event.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return ctx.json({ data: events })
  }

  @Route({
    path: '/events/:name/count',
    params: z.object({ name: z.string() }),
    response: eventCountSchema,
    summary: 'Count events by name',
  })
  async countByName(ctx: RouterContext) {
    const name = ctx.param('name')
    const count = await this.db.event.count({
      where: { name },
    })
    return ctx.json({ data: { name, count } })
  }
}
