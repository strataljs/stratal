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

  const createMessages = () => ({
    common: {
      welcome: 'Welcome',
      greeting: 'Hello, {name}!',
    },
    auth: {
      login: {
        title: 'Sign In',
      },
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()

    mockLoader = createMock<MessageLoaderService>()
    mockLoader.getMessages.mockReturnValue(createMessages() as Record<string, unknown>)

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

  describe('lazy context', () => {
    it('should create CoreContext on first t() call and reuse after', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      service.t('common.welcome' as MessageKeys)
      service.t('auth.login.title' as MessageKeys)

      // getMessages is only called once during context creation
      expect(mockLoader.getMessages).toHaveBeenCalledTimes(1)
    })
  })

  describe('flattenMessages', () => {
    it('should flatten nested messages to dot notation', () => {
      service = new I18nService(mockLoader as unknown as MessageLoaderService, mockRouterContext as unknown as RouterContext)

      const result = service.t('auth.login.title' as MessageKeys)

      expect(result).toBe('Sign In')
    })
  })
})
