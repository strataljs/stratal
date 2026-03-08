import type { Application, Constructor } from 'stratal'
import { logger } from './logger.js'
import type { Seeder } from './seeder.js'

export async function executeSeeder(
  app: Application,
  SeederClass: Constructor<Seeder>,
  dryRun: boolean
): Promise<void> {
  const seederName = SeederClass.name
  const startTime = Date.now()

  logger.section(`Running seeder: ${seederName}`)
  logger.info(`Mode: ${dryRun ? 'dry-run' : 'execute'}\n`)

  if (dryRun) {
    logger.warn('Dry run mode — skipping execution\n')
    return
  }

  try {
    const mockContext = app.createMockRouterContext('en')

    await app.container.runInRequestScope(mockContext, async (requestContainer) => {
      const seeder = requestContainer.resolve<Seeder>(SeederClass)
      await seeder.run()
    })

    const duration = Date.now() - startTime
    logger.success(`Seeder completed in ${duration}ms\n`)
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error(`Seeder failed after ${duration}ms:`)
    logger.error(error instanceof Error ? error.message : String(error))
    throw error
  }
}
