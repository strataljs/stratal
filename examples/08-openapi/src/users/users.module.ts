import { Module } from 'stratal/module'
import { UsersController } from './users.controller'

@Module({
  controllers: [UsersController],
})
export class UsersModule {}
