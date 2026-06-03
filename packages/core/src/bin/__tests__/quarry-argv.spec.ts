import { describe, expect, it } from 'vitest'
import { extractEnvFlag } from '../argv'

describe('extractEnvFlag', () => {
  describe('happy paths', () => {
    it('extracts --env <value>', () => {
      expect(extractEnvFlag(['--env', 'staging', 'cmd'])).toEqual({ env: 'staging', rest: ['cmd'] })
    })

    it('extracts -e <value>', () => {
      expect(extractEnvFlag(['-e', 'staging', 'cmd'])).toEqual({ env: 'staging', rest: ['cmd'] })
    })

    it('extracts --env=<value>', () => {
      expect(extractEnvFlag(['--env=staging', 'cmd'])).toEqual({ env: 'staging', rest: ['cmd'] })
    })

    it('extracts -e=<value>', () => {
      expect(extractEnvFlag(['-e=staging', 'cmd'])).toEqual({ env: 'staging', rest: ['cmd'] })
    })

    it('leaves env undefined when flag is absent', () => {
      expect(extractEnvFlag(['cmd', '--foo', 'bar'])).toEqual({ env: undefined, rest: ['cmd', '--foo', 'bar'] })
    })
  })

  describe('position tolerance', () => {
    it('allows flag after entry path', () => {
      expect(extractEnvFlag(['./src/x.ts', '--env', 'staging', 'cmd'])).toEqual({
        env: 'staging',
        rest: ['./src/x.ts', 'cmd'],
      })
    })

    it('allows flag before entry path', () => {
      expect(extractEnvFlag(['--env', 'staging', './src/x.ts', 'cmd'])).toEqual({
        env: 'staging',
        rest: ['./src/x.ts', 'cmd'],
      })
    })

    it('consumes flag even after the command token', () => {
      expect(extractEnvFlag(['cmd', '--env', 'staging'])).toEqual({ env: 'staging', rest: ['cmd'] })
    })
  })

  describe('-- separator', () => {
    it('stops parsing at --', () => {
      expect(extractEnvFlag(['--env', 'staging', '--', '--env', 'nope'])).toEqual({
        env: 'staging',
        rest: ['--', '--env', 'nope'],
      })
    })

    it('preserves -- for downstream parsers', () => {
      expect(extractEnvFlag(['cmd', '--', '--flag'])).toEqual({ env: undefined, rest: ['cmd', '--', '--flag'] })
    })
  })

  describe('malformed', () => {
    it('throws when --env has no following value', () => {
      expect(() => extractEnvFlag(['--env'])).toThrow('--env requires a value')
    })

    it('throws when --env is followed by another flag', () => {
      expect(() => extractEnvFlag(['--env', '--foo'])).toThrow('--env requires a value')
    })

    it('throws when -e has no following value', () => {
      expect(() => extractEnvFlag(['-e'])).toThrow('--env requires a value')
    })

    it('throws when --env= has empty value', () => {
      expect(() => extractEnvFlag(['--env='])).toThrow('--env requires a value')
    })

    it('throws when -e= has empty value', () => {
      expect(() => extractEnvFlag(['-e='])).toThrow('--env requires a value')
    })
  })

  describe('duplicates', () => {
    it('throws when --env appears twice', () => {
      expect(() => extractEnvFlag(['--env', 'a', '--env', 'b'])).toThrow('--env specified more than once')
    })

    it('throws when mixed forms appear twice', () => {
      expect(() => extractEnvFlag(['--env=a', '-e', 'b'])).toThrow('--env specified more than once')
    })
  })
})
