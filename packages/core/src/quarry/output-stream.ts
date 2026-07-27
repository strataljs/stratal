// Live output for Quarry commands.
//
// The Quarry CLI runs in Node, where `process.stdout`/`process.stderr` are real
// streams and command output should appear on the terminal immediately — long-
// running commands (e.g. `inertia:dev`, which resolves only when the dev server
// stops) must show progress live, not buffered until completion.
//
// The SAME command code can also run inside a worker via `quarry.call()` (e.g.
// MCP-over-HTTP, an admin route, a scheduled command), where there is no
// `process.stdout`. There, these are no-ops and the buffered output that
// `CommandResult` carries back to the caller is the only channel. `process` and
// its streams are resolved at call time (not module load) so the correct target
// is used per runtime and test spies on `process.stdout.write` are honoured.

interface WritableLike { write?: (chunk: string) => void }

function streamOf(name: 'stdout' | 'stderr'): WritableLike | undefined {
  return (globalThis as { process?: Record<'stdout' | 'stderr', WritableLike | undefined> }).process?.[name]
}

/** Write a line to stdout when a real stream exists; a no-op otherwise. */
export function writeStdout(line: string): void {
  streamOf('stdout')?.write?.(line)
}

/** Write a line to stderr when a real stream exists; a no-op otherwise. */
export function writeStderr(line: string): void {
  streamOf('stderr')?.write?.(line)
}
