export {}

declare module 'stratal' {
  interface QueueNames {
    notifications: true
  }

  interface StratalEnv {
    NOTIFICATIONS_QUEUE: Queue
  }
}
