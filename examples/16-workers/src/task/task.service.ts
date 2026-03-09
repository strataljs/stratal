import { injectable } from 'stratal/di'

export interface Task {
  id: string
  title: string
  userId: string
  status: 'pending' | 'processing' | 'completed'
  createdAt: string
}

const tasks = new Map<string, Task>()

@injectable()
export class TaskService {
  create(title: string, userId: string): Task {
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      userId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    tasks.set(task.id, task)
    return task
  }

  findById(id: string): Task | undefined {
    return tasks.get(id)
  }

  findByUserId(userId: string): Task[] {
    return [...tasks.values()].filter((t) => t.userId === userId)
  }

  updateStatus(id: string, status: Task['status']): Task | undefined {
    const task = tasks.get(id)
    if (task) {
      task.status = status
      tasks.set(id, task)
    }
    return task
  }

  count(): number {
    return tasks.size
  }
}
