import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GatewayAppModule } from '../fixtures/gateway.controller'

describe('WebSocket Gateway Integration', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [GatewayAppModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  it('should register gateway as a GET route', async () => {
    const hono = await module.application.ensureHono()
    const routes = hono.routes
    const wsRoute = routes.find(r => r.path === '/ws/chat' && r.method === 'GET')
    expect(wsRoute).toBeDefined()
  })

  it('should not register gateway as a non-GET route', async () => {
    const hono = await module.application.ensureHono()
    const routes = hono.routes
    const nonGetRoutes = routes.filter(r => r.path === '/ws/chat' && r.method !== 'GET' && r.method !== 'ALL')
    expect(nonGetRoutes).toHaveLength(0)
  })

  it('should respond to WebSocket upgrade requests', async () => {
    const ws = await module.ws('/ws/chat').connect()
    ws.close()
  })

  it('should echo messages back through the gateway', async () => {
    const ws = await module.ws('/ws/chat').connect()
    ws.send('hello')
    await ws.assertMessage('echo:hello')
    ws.close()
  })

  it('should complete the close handshake when gateway has no @OnClose()', async () => {
    const ws = await module.ws('/ws/no-close').connect()
    ws.send('hello')
    await ws.assertMessage('echo:hello')
    ws.close()
  })
})
