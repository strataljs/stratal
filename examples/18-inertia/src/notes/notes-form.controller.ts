import { abort } from 'stratal/errors'
import { Controller, Get, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { inject } from 'tsyringe'
import { NotesService } from './notes.service'

// Separate controller for form page routes (GET /notes/create, GET /notes/:id/edit)
// Uses @Get decorators since IController doesn't have built-in form page routes
@Controller('/notes')
export class NotesFormController {
  constructor(
    @inject(NotesService) private readonly notes: NotesService,
  ) { }

  @Get('/create')
  async create(ctx: RouterContext) {
    return ctx.inertia('notes/Create')
  }

  @Get('/:id/edit', { params: z.object({ id: z.string() }), response: z.any() })
  async edit(ctx: RouterContext) {
    const id = ctx.param('id')
    const note = await this.notes.findById(id)

    if (!note) {
      abort(404, 'Note not found')
    }

    return ctx.inertia('notes/Edit', { note })
  }
}
