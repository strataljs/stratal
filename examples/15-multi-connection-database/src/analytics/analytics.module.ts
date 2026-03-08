import { Module } from 'stratal/module'

import { EventsController } from './events.controller'
import { PageViewsController } from './page-views.controller'

@Module({
  controllers: [PageViewsController, EventsController],
})
export class AnalyticsModule {}
