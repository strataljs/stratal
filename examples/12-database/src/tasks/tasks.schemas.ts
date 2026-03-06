import { z } from 'stratal/validation'

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
})

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
})

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const taskListSchema = z.object({
  data: z.array(taskSchema),
})

export const taskResponseSchema = z.object({
  data: taskSchema,
})
