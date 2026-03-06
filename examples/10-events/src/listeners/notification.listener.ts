import type { EventContext } from 'stratal/events'
import { Listener, On } from 'stratal/events'

@Listener()
export class NotificationListener {
  @On('note.notify', { priority: 10 })
  onNoteNotify(context: EventContext<'note.notify'>) {
    console.log(
      `[Notification] Sending push notification to ${context.data.recipientId}: "${context.data.title}" (${context.data.noteId})`,
    )
  }
}
