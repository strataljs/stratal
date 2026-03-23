import { inject } from 'tsyringe'
import { Controller, type IController, type RouterContext } from 'stratal/router'
import { NotesService } from './notes/notes.service'

@Controller('/')
export class HomeController implements IController {
  constructor(
    @inject(NotesService) private readonly notes: NotesService,
  ) {}

  // Demonstrates: deferred props (note count), render options (clearHistory)
  async index(ctx: RouterContext) {
    return ctx.inertia('Home', {
      message: 'Hello from Stratal!',
      noteCount: ctx.defer(() => this.notes.count(), 'stats'),
    }, { clearHistory: true })
  }
}
