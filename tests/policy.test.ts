/**
 * Policy builder tests
 *
 * Comprehensive test coverage for policy builder and policy evaluation.
 * Target: 100% coverage (critical path).
 */

import { describe, it, expect } from 'vitest'
import { policy } from '../src/policy.js'
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'

describe('policy builder', () => {
  describe('construction', () => {
    it('should create empty policy', () => {
      const p = policy().build()
      expect(p).toBeDefined()
    })

    it('should build policy with rolesAny', () => {
      const p = policy().rolesAny('admin').build()
      expect(p).toBeDefined()
    })

    it('should build policy with rolesAll', () => {
      const p = policy().rolesAll('admin', 'verified').build()
      expect(p).toBeDefined()
    })

    it('should build policy with needAny', () => {
      const p = policy().needAny('read:data').build()
      expect(p).toBeDefined()
    })

    it('should build policy with needAll', () => {
      const p = policy().needAll('read:data', 'write:data').build()
      expect(p).toBeDefined()
    })

    it('should chain multiple rules', () => {
      const p = policy().rolesAny('admin', 'analyst').needAll('read:data', 'write:data').build()
      expect(p).toBeDefined()
    })

    it('should throw on rolesAny with no arguments', () => {
      expect(() => policy().rolesAny()).toThrow('rolesAny requires at least one role')
    })

    it('should throw on rolesAll with no arguments', () => {
      expect(() => policy().rolesAll()).toThrow('rolesAll requires at least one role')
    })

    it('should throw on needAny with no arguments', () => {
      expect(() => policy().needAny()).toThrow('needAny requires at least one permission')
    })

    it('should throw on needAll with no arguments', () => {
      expect(() => policy().needAll()).toThrow('needAll requires at least one permission')
    })
  })

  describe('empty policy evaluation', () => {
    it('should allow any payload when policy is empty', () => {
      const p = policy().build()
      const payload: JwtPayload = { sub: 'user-123' }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })
  })

  describe('rolesAny evaluation', () => {
    it('should succeed when user has one required role', () => {
      const p = policy().rolesAny('admin', 'analyst').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        roles: ['analyst', 'viewer'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })

    it('should succeed when user has multiple required roles', () => {
      const p = policy().rolesAny('admin', 'analyst').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        roles: ['admin', 'analyst'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })

    it('should fail when user has no required roles', () => {
      const p = policy().rolesAny('admin', 'analyst').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        roles: ['viewer'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
      expect(result.reason).toContain('Missing required roles')
    })

    it('should fail when roles claim is missing', () => {
      const p = policy().rolesAny('admin').build()
      const payload: JwtPayload = { sub: 'user-123' }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
      expect(result.reason).toContain('Missing required roles')
    })

    it('should fail when roles claim is empty array', () => {
      const p = policy().rolesAny('admin').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        roles: [],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
      expect(result.reason).toContain('Missing required roles')
    })

    it('should fail when roles claim is not an array', () => {
      const p = policy().rolesAny('admin').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        roles: 'admin' as unknown as string[],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
    })
  })

  describe('rolesAll evaluation', () => {
    it('should succeed when user has all required roles', () => {
      const p = policy().rolesAll('admin', 'verified').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        roles: ['admin', 'verified', 'viewer'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })

    it('should fail when user is missing one role', () => {
      const p = policy().rolesAll('admin', 'verified').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        roles: ['admin'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
      expect(result.reason).toContain('Missing required roles')
    })

    it('should fail when user has no roles', () => {
      const p = policy().rolesAll('admin', 'verified').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        roles: [],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
    })

    it('should fail when roles claim is missing', () => {
      const p = policy().rolesAll('admin').build()
      const payload: JwtPayload = { sub: 'user-123' }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
    })
  })

  describe('needAny evaluation', () => {
    it('should succeed when user has one required permission', () => {
      const p = policy().needAny('read:data', 'write:data').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: ['read:data'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })

    it('should succeed when user has multiple required permissions', () => {
      const p = policy().needAny('read:data', 'write:data').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: ['read:data', 'write:data'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })

    it('should fail when user has no required permissions', () => {
      const p = policy().needAny('read:data', 'write:data').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: ['read:other'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
      expect(result.reason).toContain('Missing required permissions')
    })

    it('should fail when permissions claim is missing', () => {
      const p = policy().needAny('read:data').build()
      const payload: JwtPayload = { sub: 'user-123' }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
    })

    it('should fail when permissions claim is empty array', () => {
      const p = policy().needAny('read:data').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: [],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
    })

    it('should fail when permissions claim is not an array', () => {
      const p = policy().needAny('read:data').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: 'read:data' as unknown as string[],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
    })
  })

  describe('needAll evaluation', () => {
    it('should succeed when user has all required permissions', () => {
      const p = policy().needAll('read:data', 'write:data').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: ['read:data', 'write:data', 'delete:data'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })

    it('should fail when user is missing one permission', () => {
      const p = policy().needAll('read:data', 'write:data').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: ['read:data'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
      expect(result.reason).toContain('Missing required permissions')
    })

    it('should fail when user has no permissions', () => {
      const p = policy().needAll('read:data', 'write:data').build()
      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: [],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
    })

    it('should fail when permissions claim is missing', () => {
      const p = policy().needAll('read:data').build()
      const payload: JwtPayload = { sub: 'user-123' }
      const result = p.evaluate(payload)
      expect(result.success).toBe(false)
    })
  })

  describe('complex policies', () => {
    it('should enforce all rules in order', () => {
      const p = policy().rolesAny('admin', 'analyst').needAll('read:data', 'write:data').build()

      // Has roles but missing permissions
      const payload1: JwtPayload = {
        sub: 'user-123',
        roles: ['admin'],
        permissions: ['read:data'],
      }
      const result1 = p.evaluate(payload1)
      expect(result1.success).toBe(false)

      // Has permissions but missing roles
      const payload2: JwtPayload = {
        sub: 'user-123',
        roles: ['viewer'],
        permissions: ['read:data', 'write:data'],
      }
      const result2 = p.evaluate(payload2)
      expect(result2.success).toBe(false)

      // Has both roles and permissions
      const payload3: JwtPayload = {
        sub: 'user-123',
        roles: ['analyst'],
        permissions: ['read:data', 'write:data'],
      }
      const result3 = p.evaluate(payload3)
      expect(result3.success).toBe(true)
    })

    it('should support multiple rolesAny rules', () => {
      const p = policy().rolesAny('admin', 'superuser').rolesAll('verified', 'approved').build()

      const payload: JwtPayload = {
        sub: 'user-123',
        roles: ['admin', 'verified', 'approved'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })

    it('should support multiple permission rules', () => {
      const p = policy()
        .needAny('read:data', 'read:reports')
        .needAll('write:logs', 'audit:access')
        .build()

      const payload: JwtPayload = {
        sub: 'user-123',
        permissions: ['read:data', 'write:logs', 'audit:access'],
      }
      const result = p.evaluate(payload)
      expect(result.success).toBe(true)
    })
  })
})
