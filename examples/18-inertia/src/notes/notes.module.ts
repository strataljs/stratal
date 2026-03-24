import { Module } from 'stratal/module'
import { NotesController } from './notes.controller'
import { NotesService } from './notes.service'

@Module({
  providers: [NotesService],
  controllers: [NotesController],
})
export class NotesModule {}
