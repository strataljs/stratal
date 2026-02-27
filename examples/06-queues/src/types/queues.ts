export { };

type QueueBindingKeys = {
  [K in keyof Cloudflare.Env]: Cloudflare.Env[K] extends Queue ? K : never
}[keyof Cloudflare.Env]

type BindingToQueueName<T extends string> =
  T extends `${infer Part}_${infer Rest}`
  ? `${Lowercase<Part>}-${BindingToQueueName<Rest>}`
  : Lowercase<T>

type DerivedQueueNames = BindingToQueueName<QueueBindingKeys>

declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env { }

  interface QueueNames extends Record<DerivedQueueNames, true> { }
}
