import { z } from 'stratal/validation'

export const createUserSchema = z
  .object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.enum(['admin', 'member', 'viewer']).default('member'),
  })
  .openapi('CreateUser')

export const updateUserSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'member', 'viewer']).optional(),
  })
  .openapi('UpdateUser')

export const userSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['admin', 'member', 'viewer']),
    createdAt: z.string(),
  })
  .openapi('User')

export const userListSchema = z
  .object({
    data: z.array(userSchema),
  })
  .openapi('UserList')

export const userResponseSchema = z
  .object({
    data: userSchema,
  })
  .openapi('UserResponse')

export type User = z.infer<typeof userSchema>
