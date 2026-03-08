import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

import {
  pageViewListSchema,
  pageViewResponseSchema,
  recordPageViewSchema,
} from './analytics.schemas'

@Controller('/api/analytics/page-views')
export class PageViewsController implements IController {
  constructor(
    @InjectDB('analytics') private readonly db: DatabaseService<'analytics'>,
  ) {}

  @Route({
    response: pageViewListSchema,
    summary: 'List page views',
  })
  async index(ctx: RouterContext) {
    const pageViews = await this.db.pageView.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return ctx.json({ data: pageViews })
  }

  @Route({
    body: recordPageViewSchema,
    response: pageViewResponseSchema,
    summary: 'Record a page view',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ path: string; userId?: string }>()
    const pageView = await this.db.pageView.create({ data: body })
    return ctx.json({ data: pageView }, 201)
  }
}
