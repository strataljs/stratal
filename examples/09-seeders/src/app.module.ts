import { Module } from 'stratal/module'
import { NotesModule } from './notes/notes.module'

@Module({
  imports: [NotesModule],
})
export class AppModule {}
