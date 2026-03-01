import { createCoreContext } from '@intlify/core-base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { type RouterContext } from '../../router/router-context'
import type { MessageKeys } from '../i18n.types'
import type { MessageLoaderService } from '../services/message-loader.service'
import { I18nService } from '../services/i18n.service'

describe('I18nService', () => {
  let service: I18nService
  let mockLoader: DeepMocked<MessageLoaderService>
  let mockRouterContext: DeepMocked<RouterContext>

  const flatMessages: Record<string, string> = {
    'common.welcome': 'Welcome',
    'common.greeting': 'Hello, {name}!',
    'auth.login.title': 'Sign In',
  }

  const createContext = (locale: string) =>
    createCoreContext({
      locale,
      messages: { [locale]: flatMessages },
      missingWarn: false,
      fallbackWarn: false,
    })

  beforeEach(() => {
    vi.clearAllMocks()

    mockLoader = createMock<MessageLoaderService>()
    mockLoader.getCoreContext.mockImplementation((locale: string) => createContext(locale))

    mockRouterContext = createMock<RouterContext>()
    mockRouterContext.getLocale.mockReturnValue('en')
  })

  describe('t()', () => {
    it('should return translated string from loader messages', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      const result = service.t('common.welcome' as MessageKeys)

      expect(result).toBe('Welcome')
    })

    it('should return interpolated message', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      const result = service.t('common.greeting' as MessageKeys, { name: 'John' })

      expect(result).toBe('Hello, John!')
    })

    it('should return the key itself as fallback for nonexistent key', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      const result = service.t('nonexistent.key' as MessageKeys)

      expect(result).toBe('nonexistent.key')
    })
  })

  describe('getLocale()', () => {
    it('should return locale from RouterContext', () => {
      mockRouterContext.getLocale.mockReturnValue('fr')
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      expect(service.getLocale()).toBe('fr')
    })

    it('should return "en" when no RouterContext', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, undefined)

      expect(service.getLocale()).toBe('en')
    })
  })

  describe('cached context', () => {
    it('should use getCoreContext from loader for each t() call', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      service.t('common.welcome' as MessageKeys)
      service.t('auth.login.title' as MessageKeys)

      // getCoreContext is called for each t() call (but it returns a cached singleton)
      expect(mockLoader.getCoreContext).toHaveBeenCalledTimes(2)
      expect(mockLoader.getCoreContext).toHaveBeenCalledWith('en')
    })
  })

  describe('flattenMessages (via loader)', () => {
    it('should translate nested keys via pre-flattened messages', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      const result = service.t('auth.login.title' as MessageKeys)

      expect(result).toBe('Sign In')
    })
  })
})
