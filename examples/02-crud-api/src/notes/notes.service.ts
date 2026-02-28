import { Transient } from 'stratal/di'
import type { CreateNoteInput, Note, UpdateNoteInput } from './notes.schemas'

@Transient()
export class NotesService {
  private static notes = new Map<string, Note>()

  findAll(): Note[] {
    return Array.from(NotesService.notes.values())
  }

  findById(id: string): Note | undefined {
    return NotesService.notes.get(id)
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

  update(id: string, input: UpdateNoteInput): Note | undefined {
    const note = NotesService.notes.get(id)
    if (!note) return undefined

    const updated: Note = {
      ...note,
      ...input,
      updatedAt: new Date().toISOString(),
    }
    NotesService.notes.set(id, updated)
    return updated
  }

  delete(id: string): boolean {
    return NotesService.notes.delete(id)
  }
}
