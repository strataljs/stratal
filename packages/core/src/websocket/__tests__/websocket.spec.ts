import { createMock } from '@stratal/testing/mocks'
import type { Context } from 'hono'
import type { WSContext } from 'hono/ws'
import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { VERSION_NEUTRAL } from '../../router/constants'
import { Controller, getControllerOptions, getControllerRoute } from '../../router/decorators/controller.decorator'
import type { RouterEnv } from '../../router/types'
import { Gateway, isGateway } from '../decorators/gateway.decorator'
import {
  OnClose,
  OnError,
  OnMessage,
  getWsOnCloseMethod,
  getWsOnErrorMethod,
  getWsOnMessageMethod,
} from '../decorators/ws-event.decorator'
import { WebSocketError } from '../websocket.error'
import { GatewayContext } from '../gateway-context'

describe('WebSocket Support', () => {
  describe('@Gateway decorator', () => {
    it('should store route retrievable via getControllerRoute()', () => {
      @Gateway('/ws/chat')
      class TestGateway { }

      expect(getControllerRoute(TestGateway)).toBe('/ws/chat')
    })

    it('should mark class as a gateway', () => {
      @Gateway('/ws/test')
      class TestGateway { }

      expect(isGateway(TestGateway)).toBe(true)
    })

    it('should store version options retrievable via getControllerOptions()', () => {
      @Gateway('/ws/chat', { version: '1' })
      class TestGateway { }

      expect(getControllerOptions(TestGateway)).toEqual({ version: '1' })
    })

    it('should support array versions', () => {
      @Gateway('/ws/chat', { version: ['1', '2'] })
      class TestGateway { }

      expect(getControllerOptions(TestGateway)).toEqual({ version: ['1', '2'] })
    })

    it('should support VERSION_NEUTRAL', () => {
      @Gateway('/ws/chat', { version: VERSION_NEUTRAL })
      class TestGateway { }

      expect(getControllerOptions(TestGateway)).toEqual({ version: VERSION_NEUTRAL })
    })

    it('should not store options when omitted', () => {
      @Gateway('/ws/chat')
      class TestGateway { }

      expect(getControllerOptions(TestGateway)).toBeUndefined()
    })
  })

  describe('isGateway()', () => {
    it('should return true for gateway classes', () => {
      @Gateway('/ws/test')
      class TestGateway { }

      expect(isGateway(TestGateway)).toBe(true)
    })

    it('should return false for controller classes', () => {
      @Controller('/api/test')
      class TestController { }

      expect(isGateway(TestController)).toBe(false)
    })

    it('should return false for plain classes', () => {
      class PlainClass { }

      expect(isGateway(PlainClass)).toBe(false)
    })
  })

  describe('WebSocket event decorators', () => {
    it('@OnMessage() should store method name', () => {
      @Gateway('/ws/test')
      class TestGateway {
        @OnMessage()
        handleMessage() { /* noop */ }
      }

      expect(getWsOnMessageMethod(TestGateway)).toBe('handleMessage')
    })

    it('@OnClose() should store method name', () => {
      @Gateway('/ws/test')
      class TestGateway {
        @OnClose()
        handleClose() { /* noop */ }
      }

      expect(getWsOnCloseMethod(TestGateway)).toBe('handleClose')
    })

    it('@OnError() should store method name', () => {
      @Gateway('/ws/test')
      class TestGateway {
        @OnError()
        handleError() { /* noop */ }
      }

      expect(getWsOnErrorMethod(TestGateway)).toBe('handleError')
    })

    it('should support all three decorators on one gateway', () => {
      @Gateway('/ws/test')
      class TestGateway {
        @OnMessage()
        onMsg() { /* noop */ }

        @OnClose()
        onCls() { /* noop */ }

        @OnError()
        onErr() { /* noop */ }
      }

      expect(getWsOnMessageMethod(TestGateway)).toBe('onMsg')
      expect(getWsOnCloseMethod(TestGateway)).toBe('onCls')
      expect(getWsOnErrorMethod(TestGateway)).toBe('onErr')
    })

    it('should return undefined when no decorator is applied', () => {
      @Gateway('/ws/test')
      class TestGateway {
        someMethod() { /* noop */ }
      }

      expect(getWsOnMessageMethod(TestGateway)).toBeUndefined()
      expect(getWsOnCloseMethod(TestGateway)).toBeUndefined()
      expect(getWsOnErrorMethod(TestGateway)).toBeUndefined()
    })

    it('should throw when multiple methods use the same event decorator', () => {
      expect(() => {
        @Gateway('/ws/test')
        class _TestGateway {
          @OnMessage()
          firstHandler() { /* noop */ }

          @OnMessage()
          secondHandler() { /* noop */ }
        }
      }).toThrow(WebSocketError)
    })
  })

  describe('GatewayContext', () => {
    const mockHonoContext = createMock<Context<RouterEnv>>({
      get: vi.fn((key: string) => {
        if (key === 'requestContainer') return { resolve: vi.fn() }
        if (key === 'locale') return 'en'
        return undefined
      }) as Context<RouterEnv>['get'],
      req: {
        header: vi.fn().mockReturnValue('Bearer token'),
        param: vi.fn((key?: string) => {
          const params: Record<string, string> = { id: '42', room: 'general' }
          return key ? params[key] : params
        }),
        query: vi.fn((key?: string) => {
          const queries: Record<string, string> = { page: '1', limit: '10' }
          return key ? queries[key] : queries
        }),
      },
    })

    const mockWsContext = createMock<WSContext>({
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    })

    it('should extend RouterContext', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      expect(ctx.getLocale()).toBe('en')
      expect(ctx.header('Authorization')).toBe('Bearer token')
    })

    it('should expose ws property', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      expect(ctx.ws).toBe(mockWsContext)
    })

    it('send() should delegate to ws.send()', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      ctx.send('hello')
      expect(mockWsContext.send).toHaveBeenCalledWith('hello')
    })

    it('close() should delegate to ws.close()', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      ctx.close(1000, 'normal')
      expect(mockWsContext.close).toHaveBeenCalledWith(1000, 'normal')
    })

    it('readyState should delegate to ws.readyState', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      expect(ctx.readyState).toBe(1)
    })

    it('param() should use raw c.req.param() instead of c.req.valid()', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      expect(ctx.param('id')).toBe('42')
      expect(mockHonoContext.req.param).toHaveBeenCalledWith('id')
    })

    it('query() with key should use raw c.req.query(key)', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      expect(ctx.query('page')).toBe('1')
      expect(mockHonoContext.req.query).toHaveBeenCalledWith('page')
    })

    it('query() without key should return all query params', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      expect(ctx.query()).toEqual({ page: '1', limit: '10' })
      expect(mockHonoContext.req.query).toHaveBeenCalledWith()
    })

    it('body() should throw WebSocketError', () => {
      const ctx = new GatewayContext(mockHonoContext, mockWsContext)

      expect(() => ctx.body()).toThrow(WebSocketError)
    })
  })
})
