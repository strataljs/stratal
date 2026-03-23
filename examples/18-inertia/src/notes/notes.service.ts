import type { StratalEnv } from 'stratal'
import { DI_TOKENS, Transient } from 'stratal/di'
import { inject } from 'tsyringe'

export interface Note {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  author: string
  body: string
}

@Transient()
export class NotesService {
  constructor(
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv,
  ) {}

  private get kv(): KVNamespace {
    return this.env.NOTES
  }

  async findAll(page = 1, perPage = 5): Promise<Note[]> {
    const index = await this.getIndex()
    const start = (page - 1) * perPage
    const ids = index.slice(start, start + perPage)

    const notes = await Promise.all(
      ids.map((id) => this.kv.get<Note>(`note:${id}`, 'json')),
    )

    return notes.filter((n): n is Note => n !== null)
  }

  async findById(id: string): Promise<Note | null> {
    return this.kv.get<Note>(`note:${id}`, 'json')
  }

  async create(input: { title: string; content: string }): Promise<Note> {
    const now = new Date().toISOString()
    const note: Note = {
      id: crypto.randomUUID(),
      title: input.title,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    }

    const index = await this.getIndex()
    index.unshift(note.id)

    await Promise.all([
      this.kv.put(`note:${note.id}`, JSON.stringify(note)),
      this.kv.put('notes:index', JSON.stringify(index)),
    ])

    return note
  }

  async update(id: string, input: { title?: string; content?: string }): Promise<Note | null> {
    const note = await this.findById(id)
    if (!note) return null

    const updated: Note = {
      ...note,
      ...input,
      updatedAt: new Date().toISOString(),
    }

    await this.kv.put(`note:${id}`, JSON.stringify(updated))
    return updated
  }

  async delete(id: string): Promise<boolean> {
    const note = await this.findById(id)
    if (!note) return false

    const index = await this.getIndex()
    const filtered = index.filter((i) => i !== id)

    await Promise.all([
      this.kv.delete(`note:${id}`),
      this.kv.put('notes:index', JSON.stringify(filtered)),
    ])

    return true
  }

  async count(): Promise<number> {
    const index = await this.getIndex()
    return index.length
  }

  async getStats(): Promise<{ total: number; recent: number }> {
    const index = await this.getIndex()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const notes = await Promise.all(
      index.map((id) => this.kv.get<Note>(`note:${id}`, 'json')),
    )

    const recent = notes.filter((n) => n && n.createdAt > oneWeekAgo).length

    return { total: index.length, recent }
  }

  getComments(_noteId: string): Comment[] {
    return [
      { id: '1', author: 'Alice', body: 'Great note! Very helpful.' },
      { id: '2', author: 'Bob', body: 'I have a follow-up question about this.' },
      { id: '3', author: 'Charlie', body: 'Thanks for sharing!' },
    ]
  }

  private async getIndex(): Promise<string[]> {
    return (await this.kv.get<string[]>('notes:index', 'json')) ?? []
  }
}
