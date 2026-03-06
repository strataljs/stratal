import { Seeder } from '@stratal/seeders'
import { inject, Transient } from 'stratal/di'
import { NotesService } from '../notes/notes.service'

@Transient()
export class NotesSeeder extends Seeder {
  constructor(@inject(NotesService) private readonly notesService: NotesService) {
    super()
  }

  async run(): Promise<void> {
    const notes = [
      { title: 'Welcome', content: 'This note was created by a seeder' },
      { title: 'Getting Started', content: 'Seeders populate your app with initial data' },
      { title: 'Stratal', content: 'A modular Cloudflare Workers framework' },
    ]

    for (const note of notes) {
      this.notesService.create(note)
    }
  }
}
