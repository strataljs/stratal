import { Module } from 'stratal'
import { UsersController } from './users.controller'

@Module({
  controllers: [UsersController],
})
export class UsersModule {}
