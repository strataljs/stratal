import { Module } from 'stratal/module'

import { DemoModule } from './demo/demo.module'

@Module({
  imports: [DemoModule],
})
export class AppModule {}
