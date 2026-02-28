import { Module } from 'stratal/module'
import { HelloController } from './hello.controller'

@Module({
  controllers: [HelloController],
})
export class AppModule {}
