import { Module } from 'stratal/module'
import { NotesController } from './notes/notes.controller'
import { NotesService } from './notes/notes.service'
import { NotesSeeder } from './seeders/notes.seeder'

@Module({
  providers: [NotesService, NotesSeeder],
  controllers: [NotesController],
})
export class AppModule {}
