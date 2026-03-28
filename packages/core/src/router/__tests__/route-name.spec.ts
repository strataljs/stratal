import { describe, expect, it } from 'vitest'
import { extractDomainParamNames, extractParamNames, generateConventionRouteName } from '../utils/route-name'

describe('Route Name Utilities', () => {
  describe('extractParamNames', () => {
    it('should extract single param', () => {
      expect(extractParamNames('/users/:id')).toEqual(['id'])
    })

    it('should extract multiple params', () => {
      expect(extractParamNames('/:companyId/users/:userId')).toEqual(['companyId', 'userId'])
    })

    it('should return empty for static paths', () => {
      expect(extractParamNames('/users')).toEqual([])
      expect(extractParamNames('/api/v1/health')).toEqual([])
    })

    it('should handle underscored names', () => {
      expect(extractParamNames('/users/:user_id')).toEqual(['user_id'])
    })

    it('should handle params with regex suffixes', () => {
      expect(extractParamNames('/api/:path{.+}')).toEqual(['path'])
    })

    it('should handle deeply nested params', () => {
      expect(extractParamNames('/users/:userId/notes/:noteId/tags/:tagId')).toEqual(['userId', 'noteId', 'tagId'])
    })
  })

  describe('extractDomainParamNames', () => {
    it('should extract single domain param', () => {
      expect(extractDomainParamNames('{tenant}.example.com')).toEqual(['tenant'])
    })

    it('should extract multiple domain params', () => {
      expect(extractDomainParamNames('{region}.{tenant}.example.com')).toEqual(['region', 'tenant'])
    })

    it('should return empty for static domains', () => {
      expect(extractDomainParamNames('example.com')).toEqual([])
      expect(extractDomainParamNames('api.example.com')).toEqual([])
    })
  })

  describe('generateConventionRouteName', () => {
    it('should generate name from simple path + method', () => {
      expect(generateConventionRouteName('/users', 'index')).toBe('users.index')
      expect(generateConventionRouteName('/users', 'show')).toBe('users.show')
      expect(generateConventionRouteName('/users', 'create')).toBe('users.create')
      expect(generateConventionRouteName('/users', 'update')).toBe('users.update')
      expect(generateConventionRouteName('/users', 'patch')).toBe('users.patch')
      expect(generateConventionRouteName('/users', 'destroy')).toBe('users.destroy')
    })

    it('should strip /api prefix', () => {
      expect(generateConventionRouteName('/api/users', 'index')).toBe('users.index')
    })

    it('should strip version prefix', () => {
      expect(generateConventionRouteName('/v1/users', 'index')).toBe('users.index')
      expect(generateConventionRouteName('/api/v1/users', 'index')).toBe('users.index')
      expect(generateConventionRouteName('/api/v2/users', 'show')).toBe('users.show')
    })

    it('should strip parameter segments', () => {
      expect(generateConventionRouteName('/:companyId/users', 'index')).toBe('users.index')
      expect(generateConventionRouteName('/users/:userId/notes', 'create')).toBe('users.notes.create')
    })

    it('should handle nested resources', () => {
      expect(generateConventionRouteName('/api/v1/users/:userId/notes', 'index')).toBe('users.notes.index')
      expect(generateConventionRouteName('/users/:userId/notes/:noteId/tags', 'index')).toBe('users.notes.tags.index')
    })

    it('should handle root path', () => {
      expect(generateConventionRouteName('/', 'index')).toBe('index')
    })

    it('should handle path with only params', () => {
      expect(generateConventionRouteName('/:companyId', 'index')).toBe('index')
    })

    it('should handle multi-word segments', () => {
      expect(generateConventionRouteName('/user-profiles', 'index')).toBe('user-profiles.index')
    })
  })
})
