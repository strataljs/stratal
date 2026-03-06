import type { EventContext } from 'stratal/events'
import { Listener, On } from 'stratal/events'

@Listener()
export class TaskListener {
  @On('after.Task.create')
  onTaskCreated(context: EventContext<'after.Task.create'>) {
    console.log('[TaskListener] New task created:', context.result)
  }

  @On('after.Task.update')
  onTaskUpdated(context: EventContext<'after.Task.update'>) {
    console.log('[TaskListener] Task updated:', context.result)
  }

  @On('after.Task.delete')
  onTaskDeleted(context: EventContext<'after.Task.delete'>) {
    console.log('[TaskListener] Task deleted')
  }
}
