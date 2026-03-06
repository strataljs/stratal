import type { EventContext } from 'stratal/events'
import { Listener, On } from 'stratal/events'

@Listener()
export class SearchIndexListener {
  @On('note.index', { priority: 5 })
  onNoteIndex(context: EventContext<'note.index'>) {
    console.log(
      `[SearchIndex] Queuing ${context.data.operation} for note "${context.data.title}" (${context.data.noteId})`,
    )
  }
}
