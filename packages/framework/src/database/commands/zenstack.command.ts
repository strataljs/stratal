import { Command } from 'stratal/quarry'

/**
 * Base command for ZenStack CLI wrappers.
 * Uses execFileSync with array arguments to prevent shell injection.
 */
export abstract class ZenStackCommand extends Command {
  protected async zenstack(args: string[]): Promise<number> {
    // Dynamic import — node:child_process is only available in the Quarry CLI (Node) context
    const { execFileSync } = await import('node:child_process')

    try {
      const output = execFileSync('npx', ['zenstack', ...args], {
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      if (output) this.info(output.trim())
      return 0
    } catch (err) {
      const error = err as { stderr?: string; stdout?: string; status?: number }
      if (error.stderr) this.error(error.stderr.trim())
      if (error.stdout) this.info(error.stdout.trim())
      return error.status ?? 1
    }
  }
}
