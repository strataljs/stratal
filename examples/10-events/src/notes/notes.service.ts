import { DI_TOKENS, inject, Transient } from 'stratal/di'
import type { IEventRegistry } from 'stratal/events'

import type { CreateNoteInput, Note, UpdateNoteInput } from './notes.schemas'

@Transient()
export class NotesService {
  private static notes = new Map<string, Note>()

  constructor(
    @inject(DI_TOKENS.EventRegistry) private readonly eventRegistry: IEventRegistry,
  ) {}

  findAll(): Note[] {
    return Array.from(NotesService.notes.values())
  }

  findById(id: string): Note | undefined {
    return NotesService.notes.get(id)
  }

  async create(input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString()
    const note: Note = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    }
    NotesService.notes.set(note.id, note)

    await Promise.all([
      this.eventRegistry.emit('note.notify', {
        data: { noteId: note.id, title: note.title, recipientId: 'collaborator-1' },
      }),
      this.eventRegistry.emit('note.index', {
        data: { noteId: note.id, title: note.title, content: note.content, operation: 'create' },
      }),
      this.eventRegistry.emit('note.webhook', {
        data: { noteId: note.id, event: 'created', timestamp: now },
      }),
    ])

    return note
  }

  async update(id: string, input: UpdateNoteInput): Promise<Note | undefined> {
    const note = NotesService.notes.get(id)
    if (!note) return undefined

    const updated: Note = { ...note, ...input, updatedAt: new Date().toISOString() }
    NotesService.notes.set(id, updated)

    await Promise.all([
      this.eventRegistry.emit('note.index', {
        data: {
          noteId: id,
          title: updated.title,
          content: updated.content,
          operation: 'update',
        },
      }),
      this.eventRegistry.emit('note.webhook', {
        data: { noteId: id, event: 'updated', timestamp: updated.updatedAt },
      }),
    ])

    return updated
  }

  async delete(id: string): Promise<boolean> {
    const deleted = NotesService.notes.delete(id)

    if (deleted) {
      await this.eventRegistry.emit('note.webhook', {
        data: { noteId: id, event: 'deleted', timestamp: new Date().toISOString() },
      })
    }

    return deleted
  }
}
