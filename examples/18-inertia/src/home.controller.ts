import { InertiaGet } from '@stratal/inertia'
import { Controller, type RouterContext } from 'stratal/router'
import { inject } from 'tsyringe'
import { NotesService } from './notes/notes.service'

@Controller('/')
export class HomeController {
  constructor(
    @inject(NotesService) private readonly notes: NotesService,
  ) { }

  // Demonstrates: deferred props (note count), render options (clearHistory)
  @InertiaGet('/')
  async index(ctx: RouterContext) {
    return ctx.inertia('Home', {
      message: 'Hello from Stratal!',
      noteCount: ctx.defer(() => this.notes.count(), 'stats'),
    }, { clearHistory: true })
  }
}
