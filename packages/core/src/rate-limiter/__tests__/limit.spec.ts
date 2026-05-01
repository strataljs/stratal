import { describe, expect, it } from 'vitest'
import { Limit } from '../limit'

describe('Limit', () => {
  describe('static factories', () => {
    it('perSecond produces a 1-second window', () => {
      const limit = Limit.perSecond(10)
      expect(limit.windowSeconds).toBe(1)
      expect(limit.max).toBe(10)
      expect(limit.disabled).toBe(false)
    })

    it('perSeconds(10, 3) → 10-second window', () => {
      const limit = Limit.perSeconds(10, 3)
      expect(limit.windowSeconds).toBe(10)
      expect(limit.max).toBe(3)
    })

    it('perMinute produces a 60-second window', () => {
      const limit = Limit.perMinute(60)
      expect(limit.windowSeconds).toBe(60)
      expect(limit.max).toBe(60)
    })

    it('perMinutes(5, 100) → 300-second window', () => {
      const limit = Limit.perMinutes(5, 100)
      expect(limit.windowSeconds).toBe(300)
      expect(limit.max).toBe(100)
    })

    it('perHour produces a 3600-second window', () => {
      const limit = Limit.perHour(1000)
      expect(limit.windowSeconds).toBe(3600)
      expect(limit.max).toBe(1000)
    })

    it('perDay produces an 86400-second window', () => {
      const limit = Limit.perDay(10_000)
      expect(limit.windowSeconds).toBe(86_400)
      expect(limit.max).toBe(10_000)
    })

    it('none() is disabled', () => {
      const limit = Limit.none()
      expect(limit.disabled).toBe(true)
    })
  })

  describe('chaining', () => {
    it('by() sets the actor key and returns this', () => {
      const limit = Limit.perMinute(60)
      expect(limit.by('user-42')).toBe(limit)
      expect(limit.key).toBe('user-42')
    })

    it('by() coerces numeric ids to strings', () => {
      const limit = Limit.perMinute(60).by(42)
      expect(limit.key).toBe('42')
    })

    it('response() captures a custom handler and returns this', () => {
      const limit = Limit.perMinute(60)
      const handler = () => new Response()
      expect(limit.response(handler)).toBe(limit)
      expect(limit.customResponse).toBe(handler)
    })

    it('chains by() and response() fluently', () => {
      const handler = () => new Response('limited', { status: 429 })
      const limit = Limit.perMinute(60).by('ip-1').response(handler)
      expect(limit.key).toBe('ip-1')
      expect(limit.customResponse).toBe(handler)
    })
  })
})
