import { describe, expect, it, vi } from 'vitest'
import { writeStderr, writeStdout } from '../output-stream'

describe('output-stream', () => {
  it('writes to process.stdout / process.stderr when real streams exist (CLI)', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      writeStdout('hello\n')
      writeStderr('boom\n')
      expect(out).toHaveBeenCalledWith('hello\n')
      expect(err).toHaveBeenCalledWith('boom\n')
    } finally {
      out.mockRestore()
      err.mockRestore()
    }
  })

  it('is a no-op when process.stdout is absent (e.g. a worker via quarry.call)', () => {
    const desc = Object.getOwnPropertyDescriptor(process, 'stdout')
    Object.defineProperty(process, 'stdout', { value: undefined, configurable: true })
    try {
      expect(() => writeStdout('nowhere\n')).not.toThrow()
    } finally {
      if (desc) Object.defineProperty(process, 'stdout', desc)
    }
  })
})
