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

  beforeEach(() => {
    vi.clearAllMocks()

    mockLoader = createMock<MessageLoaderService>()
    mockLoader.translate.mockImplementation((locale: string, key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'common.welcome': 'Welcome',
        'common.greeting': `Hello, ${(params?.['name'] as string) ?? ''}!`,
        'auth.login.title': 'Sign In',
      }
      return messages[key] ?? key
    })

    mockRouterContext = createMock<RouterContext>()
    mockRouterContext.getLocale.mockReturnValue('en')
  })

  describe('t()', () => {
    it('should return translated string from loader', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      const result = service.t('common.welcome' as MessageKeys)

      expect(result).toBe('Welcome')
      expect(mockLoader.translate).toHaveBeenCalledWith('en', 'common.welcome', undefined)
    })

    it('should pass params to loader', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      const result = service.t('common.greeting' as MessageKeys, { name: 'John' })

      expect(result).toBe('Hello, John!')
      expect(mockLoader.translate).toHaveBeenCalledWith('en', 'common.greeting', { name: 'John' })
    })

    it('should return the key itself for nonexistent key', () => {
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
})
