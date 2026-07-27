import { describe, expect, it } from 'vitest'
import { GatewayRouteTable } from '../services/gateway-route-table'

describe('GatewayRouteTable', () => {
  it('starts empty and unconfigured', () => {
    const table = new GatewayRouteTable()

    expect(table.isEmpty).toBe(true)
    expect(table.entrypoint).toBeUndefined()
  })

  it('records a partitioned route and looks it up by method and pattern', () => {
    const table = new GatewayRouteTable()
    table.record('GET', '/dashboard', ['user'])

    expect(table.lookup('GET', '/dashboard')).toEqual({ partitionBy: ['user'] })
  })

  it('ignores a route with no partitions — absence is what makes it run inline', () => {
    const table = new GatewayRouteTable()
    table.record('GET', '/pricing', [])

    expect(table.isEmpty).toBe(true)
    expect(table.lookup('GET', '/pricing')).toBeUndefined()
  })

  it('keys on the method, so a POST to a partitioned path misses', () => {
    const table = new GatewayRouteTable()
    table.record('GET', '/dashboard', ['user'])

    expect(table.lookup('POST', '/dashboard')).toBeUndefined()
  })

  it('normalises the method case on both sides', () => {
    const table = new GatewayRouteTable()
    table.record('get', '/dashboard', ['user'])

    expect(table.lookup('GET', '/dashboard')).toEqual({ partitionBy: ['user'] })
  })

  it('misses on a path that was never recorded', () => {
    const table = new GatewayRouteTable()
    table.record('GET', '/dashboard', ['user'])

    expect(table.lookup('GET', '/dashboard/settings')).toBeUndefined()
  })

  it('keeps route patterns distinct rather than collapsing them', () => {
    const table = new GatewayRouteTable()
    table.record('GET', '/t/:slug/reports', ['tenant'])
    table.record('GET', '/dashboard', ['user'])

    expect(table.size).toBe(2)
    expect(table.lookup('GET', '/t/:slug/reports')).toEqual({ partitionBy: ['tenant'] })
  })

  it('takes the entrypoint name from configure()', () => {
    const table = new GatewayRouteTable()
    table.configure('Cached')

    expect(table.entrypoint).toBe('Cached')
  })
})
