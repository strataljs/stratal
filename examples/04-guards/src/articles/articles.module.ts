import { Module } from 'stratal'
import { ArticlesController } from './articles.controller'

@Module({
  controllers: [ArticlesController],
})
export class ArticlesModule {}
