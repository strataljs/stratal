import type { InertiaService } from '@stratal/inertia'
import { INERTIA_TOKENS, InertiaDelete, InertiaGet, InertiaPost, InertiaPut } from '@stratal/inertia'
import { abort } from 'stratal/errors'
import { Controller, Get, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { inject } from 'tsyringe'
import { NotesService } from './notes.service'

@Controller('/notes')
export class NotesController {
  constructor(
    @inject(NotesService) private readonly notes: NotesService,
    @inject(INERTIA_TOKENS.InertiaService) private readonly inertia: InertiaService,
  ) { }

  // Demonstrates: merge props (paginated list), optional props (stats)
  @InertiaGet('/', { query: z.object({ page: z.coerce.number().int().min(1).optional().default(1) }) })
  async index(ctx: RouterContext) {
    const page = Number(ctx.query('page') ?? 1)

    return ctx.inertia('notes/Index', {
      notes: ctx.merge(() => this.notes.findAll(page)),
      stats: ctx.optional(() => this.notes.getStats()),
      page,
    })
  }

  // Demonstrates: deferred props (comments), render options (encryptHistory), per-request share
  @InertiaGet('/:id', { params: z.object({ id: z.string() }) })
  async show(ctx: RouterContext) {
    const id = ctx.param('id')
    const note = await this.notes.findById(id)

    if (!note) {
      abort(404, 'Note not found')
    }

    this.inertia.share('currentNote', note.title)

    return ctx.inertia('notes/Show', {
      note,
      comments: ctx.defer(() => this.notes.getComments(id), 'comments'),
    }, { encryptHistory: true })
  }

  // Form page: create new note
  @InertiaGet('/create')
  async createForm(ctx: RouterContext) {
    return ctx.inertia('notes/Create')
  }

  // Form page: edit existing note
  @InertiaGet('/:id/edit', { params: z.object({ id: z.string() }) })
  async editForm(ctx: RouterContext) {
    const id = ctx.param('id')
    const note = await this.notes.findById(id)

    if (!note) {
      abort(404, 'Note not found')
    }

    return ctx.inertia('notes/Edit', { note })
  }

  // Demonstrates: form POST handling
  @InertiaPost('/', { body: z.object({ title: z.string(), content: z.string() }) })
  async create(ctx: RouterContext) {
    const { title, content } = await ctx.body<{ title: string; content: string }>()
    const note = await this.notes.create({ title, content })
    return ctx.redirect(`/notes/${note.id}`)
  }

  // Demonstrates: form PUT handling
  @InertiaPut('/:id', {
    params: z.object({ id: z.string() }),
    body: z.object({ title: z.string().optional(), content: z.string().optional() }),
  })
  async update(ctx: RouterContext) {
    const id = ctx.param('id')
    const { title, content } = await ctx.body<{ title?: string; content?: string }>()
    const note = await this.notes.update(id, { title, content })

    if (!note) {
      abort(404, 'Note not found')
    }

    return ctx.redirect(`/notes/${id}`)
  }

  // Demonstrates: form DELETE handling
  @InertiaDelete('/:id', { params: z.object({ id: z.string() }) })
  async destroy(ctx: RouterContext) {
    const id = ctx.param('id')
    await this.notes.delete(id)
    return ctx.redirect('/notes')
  }

  // Demonstrates: inertiaService.location() for external redirects
  @Get('/export')
  export(_ctx: RouterContext) {
    return this.inertia.location('https://example.com/export')
  }
}
