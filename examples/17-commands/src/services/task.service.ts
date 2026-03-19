import { CACHE_TOKENS, type CacheService } from 'stratal/cache'
import { Transient } from 'stratal/di'
import { inject } from 'tsyringe'

export interface Task {
  id: number
  title: string
  priority: string
  status: 'pending' | 'done'
  tags: string[]
  createdAt: string
}

const COUNTER_KEY = 'task:counter'
const TASK_PREFIX = 'task:'

@Transient()
export class TaskService {
  constructor(
    @inject(CACHE_TOKENS.CacheService) private readonly cache: CacheService,
  ) { }

  async add(title: string, priority = 'normal'): Promise<Task> {
    const counter = await this.nextId()

    const task: Task = {
      id: counter,
      title,
      priority,
      status: 'pending',
      tags: [],
      createdAt: new Date().toISOString(),
    }

    await this.cache.put(`${TASK_PREFIX}${counter}`, JSON.stringify(task))

    return task
  }

  async list(): Promise<Task[]> {
    const result = await this.cache.list({ prefix: TASK_PREFIX })
    const tasks: Task[] = []

    for (const key of result.keys) {
      if (key.name === COUNTER_KEY) continue
      const data = await this.cache.get<Task>(key.name, 'json')
      if (data) tasks.push(data)
    }

    return tasks.sort((a, b) => a.id - b.id)
  }

  async find(id: number): Promise<Task | null> {
    return this.cache.get<Task>(`${TASK_PREFIX}${id}`, 'json')
  }

  async complete(id: number, note?: string): Promise<Task | null> {
    const task = await this.find(id)
    if (!task) return null

    task.status = 'done'
    if (note) task.title = `${task.title} [${note}]`

    await this.cache.put(`${TASK_PREFIX}${id}`, JSON.stringify(task))

    return task
  }

  async tag(id: number, tags: string[]): Promise<Task | null> {
    const task = await this.find(id)
    if (!task) return null

    task.tags = [...new Set([...task.tags, ...tags])]
    await this.cache.put(`${TASK_PREFIX}${id}`, JSON.stringify(task))

    return task
  }

  async reset(): Promise<number> {
    const result = await this.cache.list({ prefix: TASK_PREFIX })
    let count = 0

    for (const key of result.keys) {
      await this.cache.delete(key.name)
      count++
    }

    return count
  }

  private async nextId(): Promise<number> {
    const current = await this.cache.get(COUNTER_KEY, 'text')
    const next = current ? parseInt(current, 10) + 1 : 1
    await this.cache.put(COUNTER_KEY, String(next))
    return next
  }
}
