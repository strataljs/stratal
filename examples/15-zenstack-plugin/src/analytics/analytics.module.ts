import { Module } from 'stratal/module'

import { AnalyticsController } from './analytics.controller'

@Module({
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
