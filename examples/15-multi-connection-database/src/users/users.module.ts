import { Module } from 'stratal/module'

import { UserPostsController } from './user-posts.controller'
import { UsersController } from './users.controller'

@Module({
  controllers: [UsersController, UserPostsController],
})
export class UsersModule {}
