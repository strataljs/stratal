import { Module } from 'stratal'
import { HelloController } from './hello.controller'

@Module({
  controllers: [HelloController],
})
export class AppModule {}
