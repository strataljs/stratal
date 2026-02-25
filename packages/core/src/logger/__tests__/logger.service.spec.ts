import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { LogLevel } from '../contracts/log-level'
import type { ILogFormatter } from '../formatters/formatter.interface'
import type { ILogTransport } from '../transports/transport.interface'
import { LoggerService } from '../services/logger.service'

describe('LoggerService', () => {
  let service: LoggerService
  let mockFormatter: DeepMocked<ILogFormatter>
  let mockTransport: DeepMocked<ILogTransport>
  let mockExecutionContext: DeepMocked<ExecutionContext>

  beforeEach(() => {
    vi.clearAllMocks()

    mockFormatter = createMock<ILogFormatter>()
    mockFormatter.format.mockReturnValue('formatted-log')

    mockTransport = createMock<ILogTransport>({
      name: 'test-transport',
    })
    mockTransport.write.mockResolvedValue(undefined)

    mockExecutionContext = createMock<ExecutionContext>()
    mockExecutionContext.waitUntil.mockImplementation(() => {
      // noop
    })

    service = new LoggerService(
      LogLevel.DEBUG,
      mockExecutionContext as unknown as ExecutionContext,
      mockFormatter as unknown as ILogFormatter,
      [mockTransport] as unknown as ILogTransport[]
    )
  })

  describe('info()', () => {
    it('should dispatch to transports with LogLevel.INFO', () => {
      service.info('test message')

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          message: 'test message',
        })
      )
      expect(mockTransport.write).toHaveBeenCalled()
    })
  })

  describe('debug()', () => {
    it('should dispatch with LogLevel.DEBUG', () => {
      service.debug('debug message')

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.DEBUG,
          message: 'debug message',
        })
      )
    })
  })

  describe('warn()', () => {
    it('should dispatch with LogLevel.WARN', () => {
      service.warn('warn message')

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.WARN,
          message: 'warn message',
        })
      )
    })
  })

  describe('error()', () => {
    it('should dispatch with LogLevel.ERROR', () => {
      service.error('error message', { code: 500 })

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          message: 'error message',
        })
      )
    })

    it('should serialize error object with message, stack, and name', () => {
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
    })
  })

  describe('log level filtering', () => {
    it('should suppress debug() when level is INFO', () => {
      const infoService = new LoggerService(
        LogLevel.INFO,
        mockExecutionContext as unknown as ExecutionContext,
        mockFormatter as unknown as ILogFormatter,
        [mockTransport] as unknown as ILogTransport[]
      )

      infoService.debug('suppressed message')

      expect(mockFormatter.format).not.toHaveBeenCalled()
      expect(mockTransport.write).not.toHaveBeenCalled()
    })

    it('should not suppress error() when level is INFO', () => {
      const infoService = new LoggerService(
        LogLevel.INFO,
        mockExecutionContext as unknown as ExecutionContext,
        mockFormatter as unknown as ILogFormatter,
        [mockTransport] as unknown as ILogTransport[]
      )

      infoService.error('error message')

      expect(mockFormatter.format).toHaveBeenCalled()
      expect(mockTransport.write).toHaveBeenCalled()
    })

    it('should suppress warn() when level is ERROR', () => {
      const errorService = new LoggerService(
        LogLevel.ERROR,
        mockExecutionContext as unknown as ExecutionContext,
        mockFormatter as unknown as ILogFormatter,
        [mockTransport] as unknown as ILogTransport[]
      )

      errorService.warn('suppressed')

      expect(mockFormatter.format).not.toHaveBeenCalled()
    })
  })

  describe('context enrichment', () => {
    it('should add timestamp to context', () => {
      service.info('test')

      expect(mockFormatter.format).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            timestamp: expect.any(Number),
          }),
        })
      )
    })
  })

  describe('formatter and transports', () => {
    it('should call formatter once and pass result to all transports', () => {
      const transport2 = createMock<ILogTransport>({ name: 'transport-2' })
      transport2.write.mockResolvedValue(undefined)

      const multiService = new LoggerService(
        LogLevel.DEBUG,
        mockExecutionContext as unknown as ExecutionContext,
        mockFormatter as unknown as ILogFormatter,
        [mockTransport, transport2] as unknown as ILogTransport[]
      )

      multiService.info('test')

      expect(mockFormatter.format).toHaveBeenCalledTimes(1)
      expect(mockTransport.write).toHaveBeenCalledWith(expect.any(Object), 'formatted-log')
      expect(transport2.write).toHaveBeenCalledWith(expect.any(Object), 'formatted-log')
    })
  })

  describe('transport error handling', () => {
    it('should swallow transport errors and call console.error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // noop
    })
      mockTransport.write.mockRejectedValue(new Error('transport failed'))

      service.info('test')

      // waitUntil is called with the promise
      expect(mockExecutionContext.waitUntil).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('executionContext.waitUntil()', () => {
    it('should be called with transport write promises', () => {
      service.info('test')

      expect(mockExecutionContext.waitUntil).toHaveBeenCalledWith(expect.any(Promise))
    })
  })
})
