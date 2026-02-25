import 'reflect-metadata'

import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { NotesModule } from '../notes.module'
import { NotesService } from '../notes.service'

describe('NotesController', () => {
  let module: TestingModule

  beforeEach(async () => {
    NotesService.reset()
    module = await Test.createTestingModule({
      imports: [NotesModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  it('should create a note', async () => {
    const response = await module.http
      .post('/api/notes')
      .withBody({ title: 'Test Note', content: 'Hello from tests' })
      .send()

    response.assertCreated()
    await response.assertJsonPath('data.title', 'Test Note')
    await response.assertJsonPath('data.content', 'Hello from tests')
    await response.assertJsonPathExists('data.id')
  })

  it('should list all notes', async () => {
    // Create two notes
    await module.http
      .post('/api/notes')
      .withBody({ title: 'Note 1', content: 'First' })
      .send()
    await module.http
      .post('/api/notes')
      .withBody({ title: 'Note 2', content: 'Second' })
      .send()

    const response = await module.http.get('/api/notes').send()

    response.assertOk()
    await response.assertJsonPathCount('data', 2)
  })

  it('should get a note by id', async () => {
    const createResponse = await module.http
      .post('/api/notes')
      .withBody({ title: 'Find Me', content: 'Content' })
      .send()

    const created = await createResponse.json<{ data: { id: string } }>()
    const response = await module.http.get(`/api/notes/${created.data.id}`).send()

    response.assertOk()
    await response.assertJsonPath('data.title', 'Find Me')
  })

  it('should update a note', async () => {
    const createResponse = await module.http
      .post('/api/notes')
      .withBody({ title: 'Original', content: 'Content' })
      .send()

    const created = await createResponse.json<{ data: { id: string } }>()
    const response = await module.http
      .put(`/api/notes/${created.data.id}`)
      .withBody({ title: 'Updated' })
      .send()

    response.assertOk()
    await response.assertJsonPath('data.title', 'Updated')
  })

  it('should delete a note', async () => {
    const createResponse = await module.http
      .post('/api/notes')
      .withBody({ title: 'Delete Me', content: 'Content' })
      .send()

    const created = await createResponse.json<{ data: { id: string } }>()
    const response = await module.http.delete(`/api/notes/${created.data.id}`).send()

    response.assertOk()
    await response.assertJsonPath('success', true)
  })

  it('should return 404 for non-existent note', async () => {
    const response = await module.http.get('/api/notes/non-existent').send()

    response.assertNotFound()
  })

  it('should resolve NotesService from the container', () => {
    const service = module.get(NotesService)
    const notes = service.findAll()
    // Service should be resolvable and return empty array initially
    expect(notes).toEqual([])
  })
})
