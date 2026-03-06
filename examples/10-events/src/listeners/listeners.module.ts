import { Module } from 'stratal/module'

import { NotificationListener } from './notification.listener'
import { SearchIndexListener } from './search-index.listener'
import { StatsController } from './stats.controller'
import { StatsListener } from './stats.listener'

@Module({
  providers: [NotificationListener, SearchIndexListener, StatsListener],
  controllers: [StatsController],
})
export class ListenersModule {}
