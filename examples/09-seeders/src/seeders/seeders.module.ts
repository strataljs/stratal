import { Module } from 'stratal/module'
import { NotesModule } from '../notes/notes.module'
import { NotesSeeder } from './notes.seeder'

@Module({
  imports: [NotesModule],
  providers: [NotesSeeder],
})
export class SeedersModule {}
