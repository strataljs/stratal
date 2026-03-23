import { InertiaRoute } from '@stratal/inertia'
import { Controller, type IController, type RouterContext } from 'stratal/router'
import { inject } from 'tsyringe'
import { NotesService } from './notes/notes.service'

@Controller('/')
export class HomeController implements IController {
  constructor(
    @inject(NotesService) private readonly notes: NotesService,
  ) { }

  // Demonstrates: deferred props (note count), render options (clearHistory)
  @InertiaRoute()
  async index(ctx: RouterContext) {
    return ctx.inertia('Home', {
      message: 'Hello from Stratal!',
      noteCount: ctx.defer(() => this.notes.count(), 'stats'),
    }, { clearHistory: true })
  }
}
