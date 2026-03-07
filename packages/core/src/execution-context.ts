export interface StratalExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}
