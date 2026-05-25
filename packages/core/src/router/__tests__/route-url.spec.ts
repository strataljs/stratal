import { describe, expect, it, vi } from 'vitest'
import type { Container } from '../../di/container'
import { containerStorage } from '../../di/container-storage'
import { RouterError } from '../router.error'
import { route } from '../route-url'
import { ROUTER_TOKENS } from '../router.tokens'
import type { Uri } from '../uri'

const runWithUri = <T>(uri: Pick<Uri, 'route'>, fn: (resolveSpy: ReturnType<typeof vi.fn>) => T): T => {
  const resolveSpy = vi.fn((token: symbol) => {
    if (token === ROUTER_TOKENS.Uri) return uri
    throw new Error(`Unexpected token: ${String(token)}`)
  })
  const mockContainer = { resolve: resolveSpy }
  return containerStorage.run(mockContainer as unknown as Container, () => fn(resolveSpy))
}

describe('route() URL generation', () => {
  it('resolves Uri via ROUTER_TOKENS.Uri from the active container', () => {
    const uri = { route: vi.fn().mockReturnValue('/users') } satisfies Pick<Uri, 'route'>
    runWithUri(uri, (resolveSpy) => {
      route('users.index')
      expect(resolveSpy).toHaveBeenCalledWith(ROUTER_TOKENS.Uri)
    })
  })

  it('forwards name, params, and options to Uri.route and returns its result', () => {
    const uri = { route: vi.fn().mockReturnValue('https://example.com/users/1') } satisfies Pick<Uri, 'route'>
    runWithUri(uri, () => {
      const result = route('users.show', { id: '1' }, { absolute: true })
      expect(uri.route).toHaveBeenCalledWith('users.show', { id: '1' }, { absolute: true })
      expect(result).toBe('https://example.com/users/1')
    })
  })

  it('propagates errors thrown by Uri.route', () => {
    const uri = {
      route: vi.fn(() => {
        throw new RouterError('nonexistent')
      }),
    } satisfies Pick<Uri, 'route'>
    runWithUri(uri, () => {
      expect(() => route('nonexistent')).toThrow(RouterError)
    })
  })
})
