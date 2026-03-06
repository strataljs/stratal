import { Module } from 'stratal/module'

import { ListenersModule } from './listeners/listeners.module'
import { NotesModule } from './notes/notes.module'

import './types/events'

@Module({
  imports: [NotesModule, ListenersModule],
})
export class AppModule {}
