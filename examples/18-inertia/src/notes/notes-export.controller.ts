import { INERTIA_TOKENS } from '@stratal/inertia'
import type { InertiaService } from '@stratal/inertia'
import { inject } from 'tsyringe'
import { Controller, Get, type RouterContext } from 'stratal/router'

// Demonstrates: inertiaService.location() for external redirects
// Separate controller because @Get/@Post decorators cannot be mixed with IController methods
@Controller('/notes')
export class NotesExportController {
  constructor(
    @inject(INERTIA_TOKENS.InertiaService) private readonly inertia: InertiaService,
  ) {}

  @Get('/export')
  export(_ctx: RouterContext) {
    return this.inertia.location('https://example.com/export')
  }
}
