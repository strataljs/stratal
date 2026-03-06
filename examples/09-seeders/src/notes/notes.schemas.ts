import { z } from 'stratal/validation'

export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
})

export const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const noteListSchema = z.object({
  data: z.array(noteSchema),
})

export const noteResponseSchema = z.object({
  data: noteSchema,
})

export type CreateNoteInput = z.infer<typeof createNoteSchema>
export type Note = z.infer<typeof noteSchema>
