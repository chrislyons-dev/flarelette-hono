/**
 * authGuard middleware tests
 *
 * Comprehensive test coverage for authentication and authorization middleware.
 * Target: 95%+ coverage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authGuard, policy } from '../src/index.js'
import type { HonoEnv } from '../src/index.js'
import {
  createTestToken,
  createTokenWithRoles,
  createTokenWithPermissions,
  createExpiredToken,
  createInvalidToken,
  createTokenWithWrongIssuer,
  createTokenWithWrongAudience,
} from './fixtures/tokens.js'
import { createMockEnv } from './fixtures/mockEnv.js'

describe('authGuard middleware', () => {
  let app: Hono<HonoEnv>
  let env: HonoEnv['Bindings']

  beforeEach(() => {
    app = new Hono<HonoEnv>()
    env = createMockEnv()
  })

  describe('authentication', () => {
    it('should authenticate valid token', async () => {
      app.get('/test', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ sub: 'user-123' })
    })

    it('should inject auth into context', async () => {
      let capturedAuth = null

      app.get('/test', authGuard(), (c) => {
        capturedAuth = c.get('auth')
        return c.json({ ok: true })
      })

      const token = await createTestToken(
        {
          sub: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        },
        env
      )

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      expect(capturedAuth).toBeDefined()
      expect(capturedAuth).toMatchObject({
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      })
    })

    it('should reject request without Authorization header', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request('/test', {}, env)

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body).toEqual({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization or CF-Access-Jwt-Assertion header',
      })
    })

    it('should reject request with empty Authorization header', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: '',
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })

    it('should reject request with malformed Authorization header', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: 'NotBearer token',
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })

    it('should reject request with Bearer but no token', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: 'Bearer ',
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })

    it('should reject request with Bearer and only whitespace', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: 'Bearer    ',
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })

    it('should reject invalid token', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = createInvalidToken()

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body).toEqual({
        error: 'unauthorized',
        message: 'Invalid or expired token',
      })
    })

    it('should reject expired token', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createExpiredToken(env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body).toEqual({
        error: 'unauthorized',
        message: 'Invalid or expired token',
      })
    })

    it('should reject token with wrong issuer', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTokenWithWrongIssuer(env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })

    it('should reject token with wrong audience', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTokenWithWrongAudience(env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorization with policies', () => {
    it('should allow request when policy succeeds', async () => {
      const adminPolicy = policy().rolesAny('admin').build()

      app.get('/admin', authGuard(adminPolicy), (c) => c.json({ ok: true }))

      const token = await createTokenWithRoles(['admin'], env)

      const res = await app.request(
        '/admin',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
    })

    it('should reject request when policy fails', async () => {
      const adminPolicy = policy().rolesAny('admin').build()

      app.get('/admin', authGuard(adminPolicy), (c) => c.json({ ok: true }))

      const token = await createTokenWithRoles(['viewer'], env)

      const res = await app.request(
        '/admin',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body).toEqual({
        error: 'forbidden',
        message: 'Insufficient permissions',
      })
    })

    it('should enforce complex policies', async () => {
      const complexPolicy = policy()
        .rolesAny('admin', 'analyst')
        .needAll('read:data', 'write:data')
        .build()

      app.get('/data', authGuard(complexPolicy), (c) => c.json({ ok: true }))

      // Has roles but missing permissions
      const token1 = await createTestToken(
        {
          roles: ['admin'],
          permissions: ['read:data'],
        },
        env
      )
      const res1 = await app.request(
        '/data',
        {
          headers: { Authorization: `Bearer ${token1}` },
        },
        env
      )
      expect(res1.status).toBe(403)

      // Has permissions but missing roles
      const token2 = await createTestToken(
        {
          roles: ['viewer'],
          permissions: ['read:data', 'write:data'],
        },
        env
      )
      const res2 = await app.request(
        '/data',
        {
          headers: { Authorization: `Bearer ${token2}` },
        },
        env
      )
      expect(res2.status).toBe(403)

      // Has both roles and permissions
      const token3 = await createTestToken(
        {
          roles: ['analyst'],
          permissions: ['read:data', 'write:data'],
        },
        env
      )
      const res3 = await app.request(
        '/data',
        {
          headers: { Authorization: `Bearer ${token3}` },
        },
        env
      )
      expect(res3.status).toBe(200)
    })

    it('should work with permission-based policies', async () => {
      const writePolicy = policy().needAll('write:users').build()

      app.post('/users', authGuard(writePolicy), (c) => c.json({ ok: true }))

      // User without permission
      const token1 = await createTokenWithPermissions(['read:users'], env)
      const res1 = await app.request(
        '/users',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token1}` },
        },
        env
      )
      expect(res1.status).toBe(403)

      // User with permission
      const token2 = await createTokenWithPermissions(['write:users'], env)
      const res2 = await app.request(
        '/users',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token2}` },
        },
        env
      )
      expect(res2.status).toBe(200)
    })
  })

  describe('multiple routes', () => {
    it('should handle multiple protected routes', async () => {
      const adminPolicy = policy().rolesAny('admin').build()
      const analystPolicy = policy().rolesAny('analyst').build()

      app.get('/public', (c) => c.json({ public: true }))
      app.get('/protected', authGuard(), (c) => c.json({ protected: true }))
      app.get('/admin', authGuard(adminPolicy), (c) => c.json({ admin: true }))
      app.get('/analyst', authGuard(analystPolicy), (c) => c.json({ analyst: true }))

      const adminToken = await createTokenWithRoles(['admin'], env)
      const analystToken = await createTokenWithRoles(['analyst'], env)

      // Public route
      const res1 = await app.request('/public', {}, env)
      expect(res1.status).toBe(200)

      // Protected route with admin token
      const res2 = await app.request(
        '/protected',
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        env
      )
      expect(res2.status).toBe(200)

      // Admin route with admin token
      const res3 = await app.request(
        '/admin',
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        env
      )
      expect(res3.status).toBe(200)

      // Admin route with analyst token (should fail)
      const res4 = await app.request(
        '/admin',
        {
          headers: { Authorization: `Bearer ${analystToken}` },
        },
        env
      )
      expect(res4.status).toBe(403)

      // Analyst route with analyst token
      const res5 = await app.request(
        '/analyst',
        {
          headers: { Authorization: `Bearer ${analystToken}` },
        },
        env
      )
      expect(res5.status).toBe(200)
    })
  })

  describe('edge cases', () => {
    it('should trim whitespace from Bearer token', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer   ${token}   `,
          },
        },
        env
      )

      expect(res.status).toBe(200)
    })

    it('should handle Authorization header with extra spaces', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer    ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
    })

    it('should reject Authorization header with too many parts', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: 'Bearer token extra',
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })
  })
})
