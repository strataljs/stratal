import { Module } from 'stratal/module'

import { UserAnalyticsListener } from './user-analytics.listener'

@Module({
  providers: [UserAnalyticsListener],
})
export class ListenersModule {}
