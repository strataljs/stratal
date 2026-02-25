import { Module } from 'stratal'
import { ArticlesModule } from './articles/articles.module'

@Module({
  imports: [ArticlesModule],
})
export class AppModule {}
