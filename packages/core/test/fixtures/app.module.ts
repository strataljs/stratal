import { Module } from '../../src/module/module.decorator'
import { BenchController, BenchItemsController } from './bench.controller'

@Module({
  controllers: [BenchController, BenchItemsController],
})
export class BenchAppModule {}
