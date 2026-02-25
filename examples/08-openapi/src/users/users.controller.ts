import { Controller, IController, Route, RouterContext } from 'stratal'
import { z } from 'stratal/validation'
import {
  createUserSchema,
  updateUserSchema,
  userListSchema,
  userResponseSchema,
  type User,
} from './users.schemas'

const users = new Map<string, User>()

@Controller('/api/users', { tags: ['Users'] })
export class UsersController implements IController {
  @Route({
    response: userListSchema,
    summary: 'List all users',
    description: 'Returns a list of all registered users.',
  })
  index(ctx: RouterContext) {
    return ctx.json({ data: Array.from(users.values()) })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: userResponseSchema,
    summary: 'Get user by ID',
    description: 'Returns a single user by their unique identifier.',
  })
  show(ctx: RouterContext) {
    const user = users.get(ctx.param('id'))
    if (!user) {
      return ctx.json({ error: 'User not found' }, 404)
    }
    return ctx.json({ data: user })
  }

  @Route({
    body: createUserSchema,
    response: userResponseSchema,
    summary: 'Create a user',
    description: 'Creates a new user with the provided name, email, and role.',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ name: string; email: string; role: string }>()
    const user: User = {
      id: crypto.randomUUID(),
      name: body.name,
      email: body.email,
      role: body.role as User['role'],
      createdAt: new Date().toISOString(),
    }
    users.set(user.id, user)
    return ctx.json({ data: user }, 201)
  }

  @Route({
    params: z.object({ id: z.string() }),
    body: updateUserSchema,
    response: userResponseSchema,
    summary: 'Update a user',
    description: 'Updates an existing user. Only provided fields are changed.',
  })
  async update(ctx: RouterContext) {
    const user = users.get(ctx.param('id'))
    if (!user) {
      return ctx.json({ error: 'User not found' }, 404)
    }
    const body = await ctx.body<Partial<User>>()
    const updated = { ...user, ...body }
    users.set(user.id, updated)
    return ctx.json({ data: updated })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: z.object({ success: z.boolean() }),
    summary: 'Delete a user',
    description: 'Permanently removes a user by their ID.',
  })
  destroy(ctx: RouterContext) {
    const deleted = users.delete(ctx.param('id'))
    if (!deleted) {
      return ctx.json({ error: 'User not found' }, 404)
    }
    return ctx.json({ success: true })
  }
}
