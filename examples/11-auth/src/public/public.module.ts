import { Module } from 'stratal/module'

import { PublicController } from './public.controller'

@Module({
  controllers: [PublicController],
})
export class PublicModule {}
