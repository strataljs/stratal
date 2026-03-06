import { z } from 'stratal/validation'

export const userSchema = z.object({
  email: z.string(),
  name: z.string(),
  role: z.enum(['user', 'admin']),
  emailVerified: z.boolean(),
})

export const productSchema = z.object({
  sku: z.string(),
  name: z.string(),
  price: z.number(),
  category: z.string(),
  inStock: z.boolean(),
})

export const countQuerySchema = z.object({
  count: z.string().optional().openapi({ description: 'Number of items to generate' }),
})

export const usersResponseSchema = z.object({
  data: z.array(userSchema),
})

export const productsResponseSchema = z.object({
  data: z.array(productSchema),
})
