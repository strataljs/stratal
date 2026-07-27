import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'stratal/quarry'
import { writeTempViteConfig } from '../vite/create-vite-config'
import { startWorkerRecycler } from './worker-recycler'

// Recycle the worker isolate once its RSS reaches this many MB. The worker V8
// OOMs near ~1.4 GB; a freshly-warmed isolate sits ~250 MB, so 900 MB leaves
// generous headroom for the restart to complete before the ceiling. See
// worker-recycler.ts for why this is necessary.
const DEFAULT_HEAP_LIMIT_MB = 900

export class InertiaDevCommand extends Command {
  static command = 'inertia:dev {--port= : Dev server port} {--host : Expose to network} {--inspector-port= : Worker debugger inspector port (number, or "false" to disable). Set a distinct value per worker to avoid EADDRINUSE when running multiple Inertia workers concurrently.} {--persist-to= : Shared persist directory for @cloudflare/vite-plugin (relative to cwd; the plugin appends /v3). Use to share R2/KV/cache emulator state across multiple workers in dev.} {--heap-limit= : Recycle the dev worker isolate when its memory (MB) reaches this, to prevent the HMR-driven V8 OOM. Default 900.}'
  static description = 'Start Inertia.js Vite development server'

  async handle(): Promise<number | undefined> {
    const port = this.number('port')
    const host = this.boolean('host')
    const persistTo = this.string('persist-to')
    const inspectorPortRaw = this.string('inspector-port')
    let inspectorPort: number | false | undefined
    if (inspectorPortRaw === 'false') {
      inspectorPort = false
    } else if (inspectorPortRaw !== undefined) {
      inspectorPort = Number(inspectorPortRaw)
      if (!Number.isInteger(inspectorPort) || inspectorPort < 0 || inspectorPort > 65535) {
        this.fail(`Invalid --inspector-port "${inspectorPortRaw}". Expected an integer between 0 and 65535, or "false" to disable.`)
        return 1
      }
    }
    const heapLimitRaw = this.string('heap-limit')
    // Unset resolves to an empty string here, not undefined — treat it as default.
    const heapLimitMb = heapLimitRaw ? Number(heapLimitRaw) : DEFAULT_HEAP_LIMIT_MB
    if (!Number.isFinite(heapLimitMb) || heapLimitMb <= 0) {
      this.fail(`Invalid --heap-limit "${heapLimitRaw}". Expected a positive number of MB.`)
      return 1
    }
    const cwd = process.cwd()

    const entryPath = 'src/inertia/app.tsx'
    if (!existsSync(join(cwd, entryPath))) {
      this.fail('src/inertia/app.tsx not found. Run `quarry inertia:install` first.')
      return 1
    }

    const configPath = writeTempViteConfig({
      cwd,
      server: { port, host },
      persistTo,
      inspectorPort,
    })

    this.info('Starting Vite dev server...')

    const args = ['vite', 'dev', '--config', configPath]
    if (host) args.push('--host')

    return new Promise<number>((resolve) => {
      // stdin is piped (not inherited) so the recycler can inject Vite's `r`
      // restart shortcut; stdout/stderr stay inherited so dev output is unchanged.
      const child = spawn('npx', args, {
        cwd,
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: true,
      })

      // Forward the user's keystrokes to Vite so its interactive shortcuts
      // (r/u/o/q/h) keep working — piping stdin for the recycler would otherwise
      // swallow them. The recycler writes `r\n` to the same stdin independently.
      // Only when stdin is an interactive TTY: keystrokes come from nowhere else,
      // and a non-TTY stdin (background/CI/piped) is a plain stream without
      // unref(). unref() so this forwarded stdin never keeps the process alive on
      // its own; the child process handle does that until it exits.
      if (child.stdin && process.stdin.isTTY) {
        process.stdin.pipe(child.stdin)
        // The child's stdin closes when it exits — ignore the resulting EPIPE.
        child.stdin.on('error', () => { /* child gone */ })
        process.stdin.unref()
      }

      // Supervise the worker's memory and recycle the isolate (via a Vite
      // restart) before the HMR-driven V8 OOM. A restart resets the isolate to a
      // fresh ~40 MB. Always on — this is the OOM fix, not an opt-in.
      const stopRecycler = startWorkerRecycler({
        child,
        heapLimitMb,
        log: (msg) => this.info(`[worker-recycler] ${msg}`),
      })

      const cleanup = () => {
        stopRecycler()
        if (child.stdin && process.stdin.isTTY) process.stdin.unpipe(child.stdin)
      }

      child.on('error', (err) => {
        cleanup()
        this.fail(`Failed to start dev server: ${err.message}`)
        resolve(1)
      })

      child.on('close', (code) => {
        cleanup()
        resolve(code ?? 0)
      })
    })
  }
}
