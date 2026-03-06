import { Controller, IController, Route, RouterContext } from 'stratal/router'
import { inject } from 'stratal/di'
import { createNoteSchema, noteListSchema, noteResponseSchema } from './notes.schemas'
import { NotesService } from './notes.service'

@Controller('/api/notes')
export class NotesController implements IController {
  constructor(@inject(NotesService) private readonly notesService: NotesService) { }

  @Route({
    response: noteListSchema,
    summary: 'List all notes',
  })
  index(ctx: RouterContext) {
    const notes = this.notesService.findAll()
    return ctx.json({ data: notes })
  }

  @Route({
    body: createNoteSchema,
    response: noteResponseSchema,
    summary: 'Create a new note',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ title: string; content: string }>()
    const note = this.notesService.create(body)
    return ctx.json({ data: note }, 201)
  }
}
