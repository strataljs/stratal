import { Module } from 'stratal/module'
import { ArticlesController } from './articles.controller'

@Module({
  controllers: [ArticlesController],
})
export class ArticlesModule {}
