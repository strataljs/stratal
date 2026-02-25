import { Module } from 'stratal'
import { NotesModule } from './notes/notes.module'

@Module({
  imports: [NotesModule],
})
export class AppModule {}
