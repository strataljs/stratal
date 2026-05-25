import { AsyncLocalStorage } from 'node:async_hooks'
import { ContainerNotInitializedError } from '../errors/container-not-initialized.error'
import type { Container } from './container'

/**
 * AsyncLocalStorage for the application container.
 *
 * Set by `Application.initialize()` — all code from that point onward
 * (Stratal handlers, TestingModuleBuilder, standalone functions like `route()`)
 * can access the container without DI or static singletons.
 */
export const containerStorage = new AsyncLocalStorage<Container>()

/**
 * Get the application container from AsyncLocalStorage.
 *
 * @throws ContainerNotInitializedError if called outside `Application.initialize()` scope
 */
export function getContainer(): Container {
  const container = containerStorage.getStore()
  if (!container) {
    throw new ContainerNotInitializedError()
  }
  return container
}

/**
 * Run a function within a container context.
 *
 * @param container - The application container to store
 * @param fn - The function to execute with container access
 */
export function runWithContainer<T>(container: Container, fn: () => T): T {
  return containerStorage.run(container, fn)
}
