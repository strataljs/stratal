import { ApplicationError } from './application-error'

export class ContainerNotInitializedError extends ApplicationError {
  constructor() {
    super('Application container has not been initialized')
  }
}
