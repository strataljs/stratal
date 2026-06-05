import { ApplicationError } from './application-error'

/**
 * Thrown (as a promise rejection) when a Stratal generation is superseded by a
 * newer instance before its initialization completed — e.g. a Vite HMR reload
 * re-evaluated the worker entry mid-boot. Awaiters should retry against the
 * current generation via `Stratal.resolveApplication()`.
 */
export class StratalSupersededError extends ApplicationError {
  constructor(readonly generation: number) {
    super(`Stratal generation ${generation} was superseded by a newer instance (hot reload).`)
  }
}
