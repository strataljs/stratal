import { exports } from 'cloudflare:workers'
import type { StratalEnv } from 'stratal'
import { DI_TOKENS, inject } from 'stratal/di'
import { Controller, type IController, Route, type RouterContext, uuidParamSchema } from 'stratal/router'
import { z } from 'stratal/validation'
import { TaskService } from './task.service'

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  userId: z.string(),
  status: z.enum(['pending', 'processing', 'completed']),
  createdAt: z.string(),
})

@Controller('/api/tasks')
export class TaskController implements IController {
  constructor(
    @inject(TaskService) private readonly taskService: TaskService,
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv
  ) { }

  @Route({
    response: z.object({ tasks: z.array(taskSchema) }),
    summary: 'List tasks for a user',
    query: z.object({ userId: z.string() }),
  })
  async index(ctx: RouterContext) {
    const userId = ctx.query('userId')!
    const tasks = this.taskService.findByUserId(userId)

    return ctx.json({ tasks })
  }

  @Route({
    response: z.object({ task: taskSchema.nullable() }),
    summary: 'Get a task by ID (via RPC loopback)',
    params: uuidParamSchema
  })
  async show(ctx: RouterContext) {
    const id = ctx.param('id')

    // Look up the task via the loopback RPC export
    const task = await exports.TaskRpc.getTask(id)

    return ctx.json({ task: task ?? null })
  }

  @Route({
    response: z.object({ task: taskSchema, counterValue: z.number() }),
    summary: 'Create a task and increment the per-user Durable Object counter',
    body: z.object({
      title: z.string(),
      userId: z.string(),
    }),
  })
  async create(ctx: RouterContext) {
    const { title, userId } = await ctx.body<{ title: string; userId: string }>()
    const task = this.taskService.create(title, userId)

    // Increment the per-user counter via Durable Object
    const counterId = exports.TaskCounter.idFromName(userId)
    const counter = exports.TaskCounter.get(counterId)
    const counterValue = await counter.increment(userId)

    return ctx.json({ task, counterValue })
  }
}

@Controller('/api/tasks/:id/process')
export class TaskProcessController implements IController {
  constructor(
    @inject(TaskService) private readonly taskService: TaskService,
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv
  ) { }

  @Route({
    response: z.object({ instanceId: z.string() }),
    summary: 'Start the task processing workflow',
    params: uuidParamSchema
  })
  async create(ctx: RouterContext) {
    const id = ctx.param('id')

    const task = this.taskService.findById(id)
    if (!task) {
      return ctx.json({ error: 'Task not found' }, 404)
    }

    // Start the workflow
    const instance = await this.env.TASK_WORKFLOW.create({ params: { taskId: id } })

    return ctx.json({ instanceId: instance.id })
  }
}

@Controller('/api/tasks/user/:userId/count')
export class TaskCountController implements IController {
  constructor(
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv
  ) { }

  @Route({
    response: z.object({ count: z.number() }),
    summary: 'Get the per-user task count from Durable Object storage',
    params: z.object({
      userId: z.string().describe('User ID')
    }).openapi('userId')
  })
  async index(ctx: RouterContext) {
    const userId = ctx.param('userId')
    const counterId = this.env.TASK_COUNTER.idFromName(userId)
    const counter = this.env.TASK_COUNTER.get(counterId)
    const count = await counter.getCount()

    return ctx.json({ count })
  }
}
