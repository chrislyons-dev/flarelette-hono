/**
 * Cloudflare Access JWT authentication tests
 *
 * Tests for CF-Access-Jwt-Assertion header support and raw JWT extraction.
 * Verifies middleware can handle both OIDC (Authorization Bearer) and
 * Cloudflare Access (CF-Access-Jwt-Assertion) authentication patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authGuard, authGuardWithConfig, createHS512Config, policy } from '../src/index.js'
import type { HonoEnv } from '../src/index.js'
import { createTestToken } from './fixtures/tokens.js'
import { createMockEnv } from './fixtures/mockEnv.js'

describe('Cloudflare Access JWT authentication', () => {
  let app: Hono<HonoEnv>
  let env: HonoEnv['Bindings']

  beforeEach(() => {
    app = new Hono<HonoEnv>()
    env = createMockEnv()
  })

  describe('authGuard with CF-Access-Jwt-Assertion header', () => {
    it('should authenticate valid token from CF-Access-Jwt-Assertion header', async () => {
      app.get('/test', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            'CF-Access-Jwt-Assertion': token,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ sub: 'user-123' })
    })

    it('should inject auth into context from CF-Access-Jwt-Assertion', async () => {
      let capturedAuth = null

      app.get('/test', authGuard(), (c) => {
        capturedAuth = c.get('auth')
        return c.json({ ok: true })
      })

      const token = await createTestToken(
        {
          sub: 'user-456',
          email: 'cfaccess@example.com',
          name: 'CF Access User',
        },
        env
      )

      const res = await app.request(
        '/test',
        {
          headers: {
            'CF-Access-Jwt-Assertion': token,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      expect(capturedAuth).toBeDefined()
      expect(capturedAuth).toMatchObject({
        sub: 'user-456',
        email: 'cfaccess@example.com',
        name: 'CF Access User',
      })
    })

    it('should reject request with empty CF-Access-Jwt-Assertion header', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            'CF-Access-Jwt-Assertion': '',
          },
        },
        env
      )

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body).toEqual({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization or CF-Access-Jwt-Assertion header',
      })
    })

    it('should reject request with only whitespace in CF-Access-Jwt-Assertion', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            'CF-Access-Jwt-Assertion': '   ',
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })

    it('should trim whitespace from CF-Access-Jwt-Assertion token', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTestToken({ sub: 'user-789' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            'CF-Access-Jwt-Assertion': `  ${token}  `,
          },
        },
        env
      )

      expect(res.status).toBe(200)
    })

    it('should reject invalid token from CF-Access-Jwt-Assertion', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            'CF-Access-Jwt-Assertion': 'invalid.jwt.token',
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
  })

  describe('header precedence', () => {
    it('should prioritize Authorization header when both headers present', async () => {
      app.get('/test', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const authToken = await createTestToken({ sub: 'auth-user' }, env)
      const cfToken = await createTestToken({ sub: 'cf-user' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'CF-Access-Jwt-Assertion': cfToken,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      // Should use Authorization header (auth-user)
      expect(body).toEqual({ sub: 'auth-user' })
    })

    it('should fallback to CF-Access-Jwt-Assertion when Authorization is invalid', async () => {
      app.get('/test', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const cfToken = await createTestToken({ sub: 'cf-user' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: 'NotBearer invalid',
            'CF-Access-Jwt-Assertion': cfToken,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      // Should use CF-Access-Jwt-Assertion (cf-user)
      expect(body).toEqual({ sub: 'cf-user' })
    })

    it('should fallback to CF-Access-Jwt-Assertion when Authorization is empty', async () => {
      app.get('/test', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const cfToken = await createTestToken({ sub: 'cf-user' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: '',
            'CF-Access-Jwt-Assertion': cfToken,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ sub: 'cf-user' })
    })

    it('should reject when both headers are invalid', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: 'NotBearer invalid',
            'CF-Access-Jwt-Assertion': 'invalid.token',
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })

    it('should reject when both headers are missing', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const res = await app.request('/test', {}, env)

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body).toEqual({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization or CF-Access-Jwt-Assertion header',
      })
    })
  })

  describe('authorization policies with CF-Access-Jwt-Assertion', () => {
    it('should enforce policies with CF-Access-Jwt-Assertion token', async () => {
      const adminPolicy = policy().rolesAny('admin').build()

      app.get('/admin', authGuard(adminPolicy), (c) => c.json({ ok: true }))

      const token = await createTestToken(
        {
          sub: 'cf-admin',
          roles: ['admin'],
        },
        env
      )

      const res = await app.request(
        '/admin',
        {
          headers: {
            'CF-Access-Jwt-Assertion': token,
          },
        },
        env
      )

      expect(res.status).toBe(200)
    })

    it('should reject when policy fails with CF-Access-Jwt-Assertion token', async () => {
      const adminPolicy = policy().rolesAny('admin').build()

      app.get('/admin', authGuard(adminPolicy), (c) => c.json({ ok: true }))

      const token = await createTestToken(
        {
          sub: 'cf-viewer',
          roles: ['viewer'],
        },
        env
      )

      const res = await app.request(
        '/admin',
        {
          headers: {
            'CF-Access-Jwt-Assertion': token,
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

    it('should enforce complex policies with CF-Access-Jwt-Assertion', async () => {
      const complexPolicy = policy()
        .rolesAny('admin', 'analyst')
        .needAll('read:data', 'write:data')
        .build()

      app.get('/data', authGuard(complexPolicy), (c) => c.json({ ok: true }))

      // Valid token with all requirements
      const validToken = await createTestToken(
        {
          sub: 'cf-analyst',
          roles: ['analyst'],
          permissions: ['read:data', 'write:data'],
        },
        env
      )

      const res1 = await app.request(
        '/data',
        {
          headers: {
            'CF-Access-Jwt-Assertion': validToken,
          },
        },
        env
      )
      expect(res1.status).toBe(200)

      // Invalid token missing permissions
      const invalidToken = await createTestToken(
        {
          sub: 'cf-analyst-2',
          roles: ['analyst'],
          permissions: ['read:data'],
        },
        env
      )

      const res2 = await app.request(
        '/data',
        {
          headers: {
            'CF-Access-Jwt-Assertion': invalidToken,
          },
        },
        env
      )
      expect(res2.status).toBe(403)
    })
  })

  describe('authGuardWithConfig with CF-Access-Jwt-Assertion', () => {
    const secretBytes = Buffer.alloc(64, 42) // 64 bytes for HS512
    const secret = secretBytes.toString('base64url')
    const secretKey = new Uint8Array(secretBytes)
    const issuer = 'https://cfaccess.example.com'
    const audience = 'app.example.com'

    async function createConfigToken(payload: Record<string, unknown>): Promise<string> {
      const { SignJWT } = await import('jose')
      const jwt = new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime('1h')

      if (payload.sub !== undefined) jwt.setSubject(payload.sub as string)

      return jwt.sign(secretKey)
    }

    it('should authenticate CF-Access-Jwt-Assertion with explicit config', async () => {
      const config = createHS512Config(secret, {
        iss: issuer,
        aud: audience,
      })

      app.get('/test', authGuardWithConfig(config), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const token = await createConfigToken({ sub: 'cf-config-user' })

      const res = await app.request('/test', {
        headers: {
          'CF-Access-Jwt-Assertion': token,
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ sub: 'cf-config-user' })
    })

    it('should enforce policies with CF-Access-Jwt-Assertion and explicit config', async () => {
      const config = createHS512Config(secret, {
        iss: issuer,
        aud: audience,
      })

      const adminPolicy = policy().rolesAny('admin').build()

      app.get('/admin', authGuardWithConfig(config, adminPolicy), (c) => c.json({ ok: true }))

      const token = await createConfigToken({
        sub: 'cf-admin',
        roles: ['admin'],
      })

      const res = await app.request('/admin', {
        headers: {
          'CF-Access-Jwt-Assertion': token,
        },
      })

      expect(res.status).toBe(200)
    })

    it('should prioritize Authorization over CF-Access-Jwt-Assertion with config', async () => {
      const config = createHS512Config(secret, {
        iss: issuer,
        aud: audience,
      })

      app.get('/test', authGuardWithConfig(config), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const authToken = await createConfigToken({ sub: 'bearer-user' })
      const cfToken = await createConfigToken({ sub: 'cf-user' })

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'CF-Access-Jwt-Assertion': cfToken,
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      // Should use Authorization header (bearer-user)
      expect(body).toEqual({ sub: 'bearer-user' })
    })

    it('should fallback to CF-Access-Jwt-Assertion when Authorization has invalid format with config', async () => {
      const config = createHS512Config(secret, {
        iss: issuer,
        aud: audience,
      })

      app.get('/test', authGuardWithConfig(config), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const cfToken = await createConfigToken({ sub: 'cf-user' })

      // Use invalid format (not "Bearer <token>") so extraction fails
      // This should fallback to CF-Access-Jwt-Assertion
      const res = await app.request('/test', {
        headers: {
          Authorization: 'NotBearer invalid',
          'CF-Access-Jwt-Assertion': cfToken,
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ sub: 'cf-user' })
    })
  })

  describe('Bearer prefix handling', () => {
    it('should accept Bearer token in Authorization header', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTestToken({ sub: 'bearer-user' }, env)

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
    })

    it('should reject raw token (no Bearer prefix) in Authorization header', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTestToken({ sub: 'raw-user' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: token,
          },
        },
        env
      )

      expect(res.status).toBe(401)
    })

    it('should accept raw token (no Bearer prefix) in CF-Access-Jwt-Assertion', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTestToken({ sub: 'cf-raw-user' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            'CF-Access-Jwt-Assertion': token,
          },
        },
        env
      )

      expect(res.status).toBe(200)
    })

    it('should accept Bearer-prefixed token in CF-Access-Jwt-Assertion (edge case)', async () => {
      app.get('/test', authGuard(), (c) => c.json({ ok: true }))

      const token = await createTestToken({ sub: 'cf-bearer-user' }, env)

      const res = await app.request(
        '/test',
        {
          headers: {
            'CF-Access-Jwt-Assertion': `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
    })
  })

  describe('multiple routes with mixed headers', () => {
    it('should handle different auth methods on different routes', async () => {
      app.get('/oidc', authGuard(), (c) => c.json({ type: 'oidc' }))
      app.get('/cfaccess', authGuard(), (c) => c.json({ type: 'cfaccess' }))

      const token = await createTestToken({ sub: 'user-123' }, env)

      // OIDC route with Authorization header
      const res1 = await app.request(
        '/oidc',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )
      expect(res1.status).toBe(200)
      const body1 = await res1.json()
      expect(body1).toEqual({ type: 'oidc' })

      // CF Access route with CF-Access-Jwt-Assertion header
      const res2 = await app.request(
        '/cfaccess',
        {
          headers: {
            'CF-Access-Jwt-Assertion': token,
          },
        },
        env
      )
      expect(res2.status).toBe(200)
      const body2 = await res2.json()
      expect(body2).toEqual({ type: 'cfaccess' })
    })
  })
})
