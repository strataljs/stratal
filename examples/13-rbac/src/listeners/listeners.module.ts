import { Module } from 'stratal/module'
import { UserRoleSyncListener } from './user-role-sync.listener'

@Module({
  providers: [UserRoleSyncListener],
})
export class ListenersModule {}
