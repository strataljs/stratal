import { Module } from 'stratal/module'

import { ProfileController } from './profile.controller'

@Module({
  controllers: [ProfileController],
})
export class ProfileModule {}
