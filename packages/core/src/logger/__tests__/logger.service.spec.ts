import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { LogLevel } from '../contracts/log-level'
import type { ILogFormatter } from '../formatters/formatter.interface'
import { LoggerService } from '../services/logger.service'

describe('LoggerService', () => {
  let service: LoggerService
  let mockFormatter: DeepMocked<ILogFormatter>

  beforeEach(() => {
    vi.clearAllMocks()

    mockFormatter = createMock<ILogFormatter>()
    mockFormatter.format.mockReturnValue('formatted-log')

    service = new LoggerService(
      LogLevel.DEBUG,
      mockFormatter,
    )
  })

  describe('info()', () => {
    it('should format and write to console.info', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => { /* noop */ })

      service.info('test message')

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          message: 'test message',
        })
      )
      expect(spy).toHaveBeenCalledWith('formatted-log')

      spy.mockRestore()
    })
  })

  describe('debug()', () => {
    it('should format and write to console.debug', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => { /* noop */ })

      service.debug('debug message')

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.DEBUG,
          message: 'debug message',
        })
      )
      expect(spy).toHaveBeenCalledWith('formatted-log')

      spy.mockRestore()
    })
  })

  describe('warn()', () => {
    it('should format and write to console.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ })

      service.warn('warn message')

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.WARN,
          message: 'warn message',
        })
      )
      expect(spy).toHaveBeenCalledWith('formatted-log')

      spy.mockRestore()
    })
  })

  describe('error()', () => {
    it('should format and write to console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ })

      service.error('error message', { code: 500 })

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          message: 'error message',
        })
      )
      expect(spy).toHaveBeenCalledWith('formatted-log')

      spy.mockRestore()
    })

    it('should serialize error object with message, stack, and name', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ })
      const error = new Error('test error')
      error.name = 'TestError'

      service.error('something failed', error)

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          error: expect.objectContaining({
            message: 'test error',
            name: 'TestError',
            stack: expect.any(String),
          }),
        })
      )

      spy.mockRestore()
    })

    it('should accept both Error and context', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ })
      const error = new Error('db failed')

      service.error('query failed', error, { query: 'SELECT 1' })

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          message: 'query failed',
          context: expect.objectContaining({
            query: 'SELECT 1',
            timestamp: expect.any(Number),
          }),
          error: expect.objectContaining({
            message: 'db failed',
            stack: expect.any(String),
          }),
        })
      )

      spy.mockRestore()
    })
  })

  describe('log level filtering', () => {
    it('should suppress debug() when level is INFO', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => { /* noop */ })
      const infoService = new LoggerService(
        LogLevel.INFO,
        mockFormatter,
      )

      infoService.debug('suppressed message')

      expect(mockFormatter.format).not.toHaveBeenCalled()
      expect(spy).not.toHaveBeenCalled()

      spy.mockRestore()
    })

    it('should not suppress error() when level is INFO', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ })
      const infoService = new LoggerService(
        LogLevel.INFO,
        mockFormatter,
      )

      infoService.error('error message')

      expect(mockFormatter.format).toHaveBeenCalled()
      expect(spy).toHaveBeenCalled()

      spy.mockRestore()
    })

    it('should suppress warn() when level is ERROR', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ })
      const errorService = new LoggerService(
        LogLevel.ERROR,
        mockFormatter,
      )

      errorService.warn('suppressed')

      expect(mockFormatter.format).not.toHaveBeenCalled()
      expect(spy).not.toHaveBeenCalled()

      spy.mockRestore()
    })
  })

  describe('context enrichment', () => {
    it('should add timestamp to context', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => { /* noop */ })

      service.info('test')

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            timestamp: expect.any(Number),
          }),
        })
      )

      spy.mockRestore()
    })
  })
})
