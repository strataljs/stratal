import { execFile } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Dev-only supervisor that keeps the Inertia worker's memory bounded.
//
// `@cloudflare/vite-plugin` runs the app worker in a single long-lived workerd
// isolate. Under sustained HMR the isolate re-executes module top-level code
// (DI registration, app boot) without discarding prior instances, so its heap
// climbs monotonically to the ~1.4 GB V8 limit and aborts with "JavaScript heap
// out of memory" — the worker dies and the browser shows "Fetch failed".
//
// There is no config-level isolate memory cap in miniflare/workerd, and killing
// workerd externally wedges the dev server (miniflare never auto-respawns). The
// only clean reset is a Vite server restart: it drives the plugin through
// `miniflare.setOptions`, which SIGKILLs workerd and respawns a fresh ~40 MB
// isolate while keeping ports stable and recovering to healthy within ~1 s.
//
// So quarry (the parent that owns the spawned `vite dev` child) samples the
// workerd process RSS and, when it crosses a threshold, triggers that restart by
// writing Vite's `r` shortcut to the child's stdin. RSS (not the V8 inspector)
// is used because the consuming app installs a global undici dispatcher at boot
// that intercepts the quarry process's own fetch/WebSocket; RSS via `ps` is
// immune to that and tracks the isolate heap closely (verified: ~1.4 GB at OOM).

export interface Proc { pid: number, ppid: number, rss: number, cmd: string }

// Parse `ps -axo pid=,ppid=,rss=,command=` output (rss in KB). Exported for tests.
export function parsePsProcs(stdout: string): Proc[] {
  const procs: Proc[] = []
  for (const line of stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (m) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), cmd: m[4] })
  }
  return procs
}

// Max RSS (MB) among workerd processes descended from `rootPid` (the spawned vite
// child). Returns null when no workerd descendant is found (worker still booting).
// Pure and exported for tests. `rss` is in KB.
export function maxWorkerdRssMb(procs: Proc[], rootPid: number): number | null {
  const childrenOf = new Map<number, number[]>()
  for (const p of procs) {
    const arr = childrenOf.get(p.ppid)
    if (arr) arr.push(p.pid)
    else childrenOf.set(p.ppid, [p.pid])
  }
  const byPid = new Map(procs.map(p => [p.pid, p]))
  const stack = [rootPid]
  const seen = new Set<number>()
  let maxRssKb = 0
  while (stack.length) {
    const pid = stack.pop()!
    if (seen.has(pid)) continue
    seen.add(pid)
    const p = byPid.get(pid)
    if (p && p.cmd.includes('workerd') && p.rss > maxRssKb) maxRssKb = p.rss
    for (const c of childrenOf.get(pid) ?? []) stack.push(c)
  }
  return maxRssKb > 0 ? Math.round(maxRssKb / 1024) : null
}

async function readWorkerRssMb(rootPid: number): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { maxBuffer: 64 * 1024 * 1024 })
    return maxWorkerdRssMb(parsePsProcs(stdout), rootPid)
  } catch {
    return null
  }
}

export interface WorkerRecyclerOptions {
  /** The spawned `vite dev` child; its stdin must be piped. */
  child: ChildProcess
  /** Recycle when the worker's RSS reaches this many MB. */
  heapLimitMb: number
  /** How often to sample RSS. */
  intervalMs?: number
  /** Minimum gap between recycles, to let a restart settle. */
  cooldownMs?: number
  log: (msg: string) => void
}

/**
 * Start sampling the worker's RSS and recycle it (via a Vite restart) before it
 * can reach the V8 OOM ceiling. Returns a stop function.
 */
export function startWorkerRecycler(opts: WorkerRecyclerOptions): () => void {
  // Poll fast and keep the post-recycle cooldown just long enough to cover a
  // Vite restart (~1-2 s), so RSS can't overshoot far past the threshold toward
  // the OOM ceiling under intense churn (overshoot ≈ (interval+cooldown)×growth).
  const intervalMs = opts.intervalMs ?? 1500
  const cooldownMs = opts.cooldownMs ?? 3000
  const rootPid = opts.child.pid
  const debug = process.env.STRATAL_RECYCLER_DEBUG === '1'
  let lastRecycle = 0
  let stopped = false

  // RSS sampling uses `ps`, which is POSIX-only; elsewhere the worker is left
  // unsupervised. Warn once (it never fires on the common macOS/Linux path) —
  // otherwise the recycler is silent unless it actually recycles.
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    opts.log(`memory supervision unavailable on ${process.platform} (needs macOS/Linux)`)
    return () => { /* nothing to stop */ }
  }

  if (rootPid == null) return () => { /* no child to supervise */ }

  const timer = setInterval(() => {
    if (stopped) return
    void readWorkerRssMb(rootPid).then((rssMb) => {
      if (stopped || rssMb == null) return
      if (debug) opts.log(`worker RSS ${rssMb}MB / limit ${opts.heapLimitMb}MB`)
      if (rssMb >= opts.heapLimitMb && Date.now() - lastRecycle > cooldownMs) {
        lastRecycle = Date.now()
        opts.log(`recycling dev worker (${rssMb}MB)`)
        try {
          opts.child.stdin?.write('r\n')
        } catch (e) {
          opts.log(`failed to signal Vite restart: ${(e as Error).message}`)
        }
      }
    })
  }, intervalMs)

  return () => { stopped = true; clearInterval(timer) }
}
