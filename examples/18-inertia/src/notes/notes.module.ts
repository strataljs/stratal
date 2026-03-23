import { Module } from 'stratal/module'
import { NotesController } from './notes.controller'
import { NotesExportController } from './notes-export.controller'
import { NotesFormController } from './notes-form.controller'
import { NotesService } from './notes.service'

@Module({
  providers: [NotesService],
  controllers: [NotesFormController, NotesExportController, NotesController],
})
export class NotesModule {}
