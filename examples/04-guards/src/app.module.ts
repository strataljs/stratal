import { Module } from 'stratal/module'
import { ArticlesModule } from './articles/articles.module'

@Module({
  imports: [ArticlesModule],
})
export class AppModule {}
