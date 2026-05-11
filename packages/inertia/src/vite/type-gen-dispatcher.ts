import { URL } from 'node:url'
import { Worker } from 'node:worker_threads'

export interface TypeGenWorkerResult {
  ok: boolean
  outputPath?: string
  pageCount?: number
  error?: string
}

export interface TypeGenWorkerHandle {
  on(event: 'message', cb: (m: TypeGenWorkerResult) => void): this
  on(event: 'error', cb: (e: Error) => void): this
  on(event: 'exit', cb: (code: number) => void): this
  terminate(): Promise<number> | number
}

export type TypeGenWorkerSpawner = (cwd: string) => TypeGenWorkerHandle

export interface TypeGenDispatcher {
  schedule(): void
  dispose(): Promise<void>
}

export interface TypeGenDispatcherOptions {
  cwd: string
  spawn?: TypeGenWorkerSpawner
  debounceMs?: number
  onResult?: (result: TypeGenWorkerResult) => void
  onError?: (error: Error) => void
}

const defaultSpawn: TypeGenWorkerSpawner = (cwd) =>
  new Worker(new URL('./generator/type-generator.worker.mjs', import.meta.url), {
    workerData: { cwd },
  })

export function createTypeGenDispatcher(options: TypeGenDispatcherOptions): TypeGenDispatcher {
  const spawn = options.spawn ?? defaultSpawn
  const debounceMs = options.debounceMs ?? 250

  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let inflight: TypeGenWorkerHandle | null = null
  let queued = false
  let disposed = false

  function fire() {
    pendingTimer = null
    if (disposed) return
    if (inflight) {
      queued = true
      return
    }

    const worker = spawn(options.cwd)
    inflight = worker

    const finish = () => {
      if (inflight === worker) inflight = null
      if (disposed) return
      if (queued) {
        queued = false
        fire()
      }
    }

    worker.on('message', (msg) => {
      // `exit` will follow; finish() runs there so terminate() has settled before the next spawn.
      options.onResult?.(msg)
    })

    worker.on('error', (err) => {
      options.onError?.(err)
    })

    worker.on('exit', () => {
      finish()
    })
  }

  return {
    schedule() {
      if (disposed) return
      if (inflight) {
        queued = true
        return
      }
      if (pendingTimer) clearTimeout(pendingTimer)
      pendingTimer = setTimeout(fire, debounceMs)
    },

    async dispose() {
      disposed = true
      queued = false
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
      const worker = inflight
      inflight = null
      if (worker) {
        try {
          await worker.terminate()
        } catch {
          // ignore
        }
      }
    },
  }
}
