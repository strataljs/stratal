import { Application, type Constructor, type StratalEnv } from 'stratal'
import { LogLevel } from 'stratal/logger'

export async function loadApp(
  module: Constructor,
  wranglerPath: string
): Promise<{ app: Application; dispose: () => Promise<void> }> {
  const { getPlatformProxy } = await import('wrangler')

  const { env, ctx, dispose } = await getPlatformProxy({
    configPath: wranglerPath,
  })

  const app = new Application({
    module,
    logging: {
      level: LogLevel.ERROR,
      formatter: 'pretty'
    },
    env: env as unknown as StratalEnv,
    ctx,
  })
  try {
    await app.initialize()
  } catch (error) {
    await dispose()
    throw error
  }

  return { app, dispose }
}
