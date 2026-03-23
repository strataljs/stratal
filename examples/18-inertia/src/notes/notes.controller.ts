import { INERTIA_TOKENS } from '@stratal/inertia'
import type { InertiaService } from '@stratal/inertia'
import { inject } from 'tsyringe'
import { Controller, type IController, type RouterContext } from 'stratal/router'
import { NotesService } from './notes.service'

@Controller('/notes')
export class NotesController implements IController {
  constructor(
    @inject(NotesService) private readonly notes: NotesService,
    @inject(INERTIA_TOKENS.InertiaService) private readonly inertia: InertiaService,
  ) {}

  // Demonstrates: merge props (paginated list), optional props (stats)
  async index(ctx: RouterContext) {
    const page = Number(ctx.query('page') ?? '1')

    return ctx.inertia('notes/Index', {
      notes: ctx.merge(() => this.notes.findAll(page)),
      stats: ctx.optional(() => this.notes.getStats()),
      page,
    })
  }

  // Demonstrates: deferred props (comments), render options (encryptHistory), per-request share
  async show(ctx: RouterContext) {
    const id = ctx.param('id')
    const note = await this.notes.findById(id)

    if (!note) {
      return ctx.json({ error: 'Note not found' }, 404)
    }

    this.inertia.share('currentNote', note.title)

    return ctx.inertia('notes/Show', {
      note,
      comments: ctx.defer(() => this.notes.getComments(id), 'comments'),
    }, { encryptHistory: true })
  }

  // Demonstrates: form POST handling
  async create(ctx: RouterContext) {
    const { title, content } = await ctx.body<{ title: string; content: string }>()
    const note = await this.notes.create({ title, content })
    return ctx.redirect(`/notes/${note.id}`)
  }

  // Demonstrates: form PUT handling
  async update(ctx: RouterContext) {
    const id = ctx.param('id')
    const { title, content } = await ctx.body<{ title?: string; content?: string }>()
    const note = await this.notes.update(id, { title, content })

    if (!note) {
      return ctx.json({ error: 'Note not found' }, 404)
    }

    return ctx.redirect(`/notes/${id}`)
  }

  // Demonstrates: form DELETE handling
  async destroy(ctx: RouterContext) {
    const id = ctx.param('id')
    await this.notes.delete(id)
    return ctx.redirect('/notes')
  }
}
