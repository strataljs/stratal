import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

import { createTaskSchema, taskListSchema, taskResponseSchema, updateTaskSchema } from './tasks.schemas'

@Controller('/api/tasks')
export class TasksController implements IController {
  constructor(
    @InjectDB('main') private readonly db: DatabaseService<'main'>,
  ) {}

  @Route({
    response: taskListSchema,
    summary: 'List all tasks',
  })
  async index(ctx: RouterContext) {
    const tasks = await this.db.task.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return ctx.json({ data: tasks })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: taskResponseSchema,
    summary: 'Get a task by ID',
  })
  async show(ctx: RouterContext) {
    const task = await this.db.task.findUnique({
      where: { id: ctx.param('id') },
    })
    if (!task) return ctx.json({ error: 'Task not found' }, 404)
    return ctx.json({ data: task })
  }

  @Route({
    body: createTaskSchema,
    response: taskResponseSchema,
    summary: 'Create a new task',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ title: string; description?: string }>()
    const task = await this.db.task.create({
      data: body,
    })
    return ctx.json({ data: task }, 201)
  }

  @Route({
    params: z.object({ id: z.string() }),
    body: updateTaskSchema,
    response: taskResponseSchema,
    summary: 'Update a task',
  })
  async update(ctx: RouterContext) {
    const body = await ctx.body<{ title?: string; description?: string; completed?: boolean }>()
    const task = await this.db.task.update({
      where: { id: ctx.param('id') },
      data: body,
    })
    return ctx.json({ data: task })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: z.object({ success: z.boolean() }),
    summary: 'Delete a task',
  })
  async destroy(ctx: RouterContext) {
    await this.db.task.delete({
      where: { id: ctx.param('id') },
    })
    return ctx.json({ success: true })
  }
}
