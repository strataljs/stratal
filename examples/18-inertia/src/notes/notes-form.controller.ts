import { inject } from 'tsyringe'
import { Controller, Get, type RouterContext } from 'stratal/router'
import { NotesService } from './notes.service'

// Separate controller for form page routes (GET /notes/create, GET /notes/:id/edit)
// Uses @Get decorators since IController doesn't have built-in form page routes
@Controller('/notes')
export class NotesFormController {
  constructor(
    @inject(NotesService) private readonly notes: NotesService,
  ) {}

  @Get('/create')
  async create(ctx: RouterContext) {
    return ctx.inertia('notes/Create')
  }

  @Get('/:id/edit')
  async edit(ctx: RouterContext) {
    const id = ctx.param('id')
    const note = await this.notes.findById(id)

    if (!note) {
      return ctx.json({ error: 'Note not found' }, 404)
    }

    return ctx.inertia('notes/Edit', { note })
  }
}
