import { Transient } from 'stratal/di'
import type { CreateNoteInput, Note } from './notes.schemas'

@Transient()
export class NotesService {
  private static notes = new Map<string, Note>()

  findAll(): Note[] {
    return Array.from(NotesService.notes.values())
  }

  create(input: CreateNoteInput): Note {
    const now = new Date().toISOString()
    const note: Note = {
      id: crypto.randomUUID(),
      title: input.title,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    }
    NotesService.notes.set(note.id, note)
    return note
  }
}
