import { ApplicationError } from './application-error'

export class StratalNotInitializedError extends ApplicationError {
  constructor() {
    super('Stratal has not been initialized. Ensure you export a Stratal instance as the default export.')
  }
}
