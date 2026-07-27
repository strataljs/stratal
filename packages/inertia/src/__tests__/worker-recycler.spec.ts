import { describe, expect, it } from 'vitest'
import { maxWorkerdRssMb, parsePsProcs } from '../commands/worker-recycler'

describe('parsePsProcs', () => {
  it('parses `ps -axo pid=,ppid=,rss=,command=` lines (rss in KB)', () => {
    const out = [
      '  100     1  2048 /usr/bin/node vite dev',
      '  200   100 1048576 .../workerd serve --binary',
      '',
    ].join('\n')
    expect(parsePsProcs(out)).toEqual([
      { pid: 100, ppid: 1, rss: 2048, cmd: '/usr/bin/node vite dev' },
      { pid: 200, ppid: 100, rss: 1048576, cmd: '.../workerd serve --binary' },
    ])
  })

  it('ignores blank and malformed lines', () => {
    expect(parsePsProcs('\n  not a process line\n   \n')).toEqual([])
  })
})

describe('maxWorkerdRssMb', () => {
  // rootPid is the spawned vite child; workerd runs as its descendant.
  const rootPid = 100

  it('returns the max workerd RSS (MB) among descendants of rootPid', () => {
    const procs = [
      { pid: 100, ppid: 1, rss: 90_000, cmd: 'node vite dev' },
      { pid: 200, ppid: 100, rss: 900 * 1024, cmd: 'workerd serve' }, // 900 MB
      { pid: 201, ppid: 100, rss: 40 * 1024, cmd: 'workerd serve' }, //  40 MB
    ]
    expect(maxWorkerdRssMb(procs, rootPid)).toBe(900)
  })

  it('finds workerd nested deeper in the tree (grandchild)', () => {
    const procs = [
      { pid: 100, ppid: 1, rss: 1000, cmd: 'sh -c npx vite dev' },
      { pid: 150, ppid: 100, rss: 90_000, cmd: 'node vite dev' },
      { pid: 250, ppid: 150, rss: 512 * 1024, cmd: 'workerd serve' }, // 512 MB
    ]
    expect(maxWorkerdRssMb(procs, rootPid)).toBe(512)
  })

  it('ignores workerd NOT descended from rootPid (e.g. another dev server)', () => {
    const procs = [
      { pid: 100, ppid: 1, rss: 1000, cmd: 'node vite dev' },
      { pid: 200, ppid: 100, rss: 300 * 1024, cmd: 'workerd serve' }, // ours: 300 MB
      { pid: 900, ppid: 1, rss: 1400 * 1024, cmd: 'workerd serve' }, // foreign: 1.4 GB — must be ignored
    ]
    expect(maxWorkerdRssMb(procs, rootPid)).toBe(300)
  })

  it('returns null when rootPid has no workerd descendant yet (still booting)', () => {
    const procs = [
      { pid: 100, ppid: 1, rss: 90_000, cmd: 'node vite dev' },
    ]
    expect(maxWorkerdRssMb(procs, rootPid)).toBeNull()
  })

  it('does not infinite-loop on a cyclic ppid graph', () => {
    const procs = [
      { pid: 100, ppid: 200, rss: 1000, cmd: 'node vite dev' },
      { pid: 200, ppid: 100, rss: 128 * 1024, cmd: 'workerd serve' },
    ]
    expect(maxWorkerdRssMb(procs, rootPid)).toBe(128)
  })
})
