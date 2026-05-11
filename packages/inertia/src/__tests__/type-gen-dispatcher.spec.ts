import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTypeGenDispatcher,
  type TypeGenWorkerHandle,
  type TypeGenWorkerResult,
  type TypeGenWorkerSpawner,
} from '../vite/type-gen-dispatcher'

interface FakeWorker extends TypeGenWorkerHandle {
  emit(event: 'message' | 'error' | 'exit', payload?: unknown): void
}

function createFakeWorker(): FakeWorker {
  const listeners: Record<string, ((arg: unknown) => void)[]> = {
    message: [],
    error: [],
    exit: [],
  }

  const worker: FakeWorker = {
    on(event, cb) {
      listeners[event].push(cb as (arg: unknown) => void)
      return worker
    },
    emit(event, payload) {
      for (const cb of listeners[event]) cb(payload)
    },
    terminate: vi.fn(() => Promise.resolve(0)),
  }
  return worker
}

describe('createTypeGenDispatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces rapid schedule() calls into a single worker spawn within the debounce window', () => {
    const fakes: FakeWorker[] = []
    const spawn: TypeGenWorkerSpawner = vi.fn(() => {
      const w = createFakeWorker()
      fakes.push(w)
      return w
    })

    const dispatcher = createTypeGenDispatcher({ cwd: '/tmp', spawn, debounceMs: 100 })

    for (let i = 0; i < 10; i++) dispatcher.schedule()

    expect(spawn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)

    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('queues exactly one follow-up when schedule() lands while a worker is in-flight', () => {
    const fakes: FakeWorker[] = []
    const spawn: TypeGenWorkerSpawner = vi.fn(() => {
      const w = createFakeWorker()
      fakes.push(w)
      return w
    })

    const dispatcher = createTypeGenDispatcher({ cwd: '/tmp', spawn, debounceMs: 50 })

    dispatcher.schedule()
    vi.advanceTimersByTime(50)
    expect(spawn).toHaveBeenCalledTimes(1)

    // Many schedule() calls while the first worker is still running
    for (let i = 0; i < 5; i++) dispatcher.schedule()

    // First worker finishes
    fakes[0].emit('exit', 0)

    // The dispatcher fires the follow-up *immediately* (no extra debounce) because
    // a save was already pending while we were busy.
    expect(spawn).toHaveBeenCalledTimes(2)

    // Second worker finishes — no third spawn
    fakes[1].emit('exit', 0)
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('forwards worker results to onResult', () => {
    const onResult = vi.fn<(r: TypeGenWorkerResult) => void>()
    const fake = createFakeWorker()
    const spawn: TypeGenWorkerSpawner = () => fake

    const dispatcher = createTypeGenDispatcher({
      cwd: '/tmp',
      spawn,
      debounceMs: 0,
      onResult,
    })

    dispatcher.schedule()
    vi.advanceTimersByTime(0)
    fake.emit('message', { ok: true, pageCount: 4 })
    fake.emit('exit', 0)

    expect(onResult).toHaveBeenCalledWith({ ok: true, pageCount: 4 })
  })

  it('forwards worker errors to onError', () => {
    const onError = vi.fn<(e: Error) => void>()
    const fake = createFakeWorker()
    const spawn: TypeGenWorkerSpawner = () => fake

    const dispatcher = createTypeGenDispatcher({
      cwd: '/tmp',
      spawn,
      debounceMs: 0,
      onError,
    })

    dispatcher.schedule()
    vi.advanceTimersByTime(0)
    const err = new Error('boom')
    fake.emit('error', err)

    expect(onError).toHaveBeenCalledWith(err)
  })

  it('dispose() cancels a pending debounce without spawning', async () => {
    const spawn: TypeGenWorkerSpawner = vi.fn(() => createFakeWorker())
    const dispatcher = createTypeGenDispatcher({ cwd: '/tmp', spawn, debounceMs: 100 })

    dispatcher.schedule()
    await dispatcher.dispose()

    vi.advanceTimersByTime(500)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('dispose() terminates an in-flight worker and prevents follow-ups', async () => {
    const fake = createFakeWorker()
    const spawn: TypeGenWorkerSpawner = vi.fn(() => fake)
    const dispatcher = createTypeGenDispatcher({ cwd: '/tmp', spawn, debounceMs: 50 })

    dispatcher.schedule()
    vi.advanceTimersByTime(50)
    expect(spawn).toHaveBeenCalledTimes(1)

    dispatcher.schedule() // queue a follow-up
    await dispatcher.dispose()

    expect(fake.terminate).toHaveBeenCalledTimes(1)

    fake.emit('exit', 0)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('schedule() after dispose() is a no-op', async () => {
    const spawn: TypeGenWorkerSpawner = vi.fn(() => createFakeWorker())
    const dispatcher = createTypeGenDispatcher({ cwd: '/tmp', spawn, debounceMs: 50 })

    await dispatcher.dispose()
    dispatcher.schedule()
    vi.advanceTimersByTime(500)

    expect(spawn).not.toHaveBeenCalled()
  })
})
