import { z } from 'stratal/validation'

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
})

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(200).optional(),
})

export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  published: z.boolean().optional(),
})

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const postSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  published: z.boolean(),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const userListSchema = z.object({
  data: z.array(userSchema),
})

export const userResponseSchema = z.object({
  data: userSchema,
})

export const postResponseSchema = z.object({
  data: postSchema,
})

export const postListSchema = z.object({
  data: z.array(postSchema),
})
