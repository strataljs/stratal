import type { CustomEventContext } from 'stratal/events'

export {}

declare module 'stratal/events' {
  interface CustomEventRegistry {
    'note.notify': CustomEventContext<{ noteId: string; title: string; recipientId: string }>
    'note.index': CustomEventContext<{
      noteId: string
      title: string
      content: string
      operation: 'create' | 'update'
    }>
    'note.webhook': CustomEventContext<{
      noteId: string
      event: 'created' | 'updated' | 'deleted'
      timestamp: string
    }>
  }
}
