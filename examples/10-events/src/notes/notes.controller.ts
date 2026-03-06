import { inject } from 'stratal/di'
import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'

import { noteListSchema, noteResponseSchema, createNoteSchema, updateNoteSchema } from './notes.schemas'
import { NotesService } from './notes.service'

@Controller('/api/notes')
export class NotesController implements IController {
  constructor(@inject(NotesService) private readonly notesService: NotesService) {}

  @Route({
    response: noteListSchema,
    summary: 'List all notes',
  })
  index(ctx: RouterContext) {
    const notes = this.notesService.findAll()
    return ctx.json({ data: notes })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: noteResponseSchema,
    summary: 'Get a note by ID',
  })
  show(ctx: RouterContext) {
    const note = this.notesService.findById(ctx.param('id'))
    if (!note) return ctx.json({ error: 'Note not found' }, 404)
    return ctx.json({ data: note })
  }

  @Route({
    body: createNoteSchema,
    response: noteResponseSchema,
    summary: 'Create a new note',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ title: string; content: string }>()
    const note = await this.notesService.create(body)
    return ctx.json({ data: note }, 201)
  }

  @Route({
    params: z.object({ id: z.string() }),
    body: updateNoteSchema,
    response: noteResponseSchema,
    summary: 'Update a note',
  })
  async update(ctx: RouterContext) {
    const body = await ctx.body<{ title?: string; content?: string }>()
    const note = await this.notesService.update(ctx.param('id'), body)
    if (!note) return ctx.json({ error: 'Note not found' }, 404)
    return ctx.json({ data: note })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: z.object({ success: z.boolean() }),
    summary: 'Delete a note',
  })
  async destroy(ctx: RouterContext) {
    const deleted = await this.notesService.delete(ctx.param('id'))
    if (!deleted) return ctx.json({ error: 'Note not found' }, 404)
    return ctx.json({ success: true })
  }
}
