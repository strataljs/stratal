import { z } from 'stratal/validation'

export const recordPageViewSchema = z.object({
  path: z.string().min(1),
  userId: z.string().optional(),
})

export const recordEventSchema = z.object({
  name: z.string().min(1),
  payload: z.string().optional(),
  userId: z.string().optional(),
})

export const pageViewSchema = z.object({
  id: z.string(),
  path: z.string(),
  userId: z.string().nullable(),
  createdAt: z.string(),
})

export const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  payload: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string(),
})

export const pageViewListSchema = z.object({
  data: z.array(pageViewSchema),
})

export const pageViewResponseSchema = z.object({
  data: pageViewSchema,
})

export const eventListSchema = z.object({
  data: z.array(eventSchema),
})

export const eventResponseSchema = z.object({
  data: eventSchema,
})

