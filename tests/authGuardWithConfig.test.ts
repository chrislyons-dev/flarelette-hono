/**
 * authGuardWithConfig middleware tests
 *
 * Tests for explicit configuration API - verifies middleware works
 * without environment variables or global state.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authGuardWithConfig, createHS512Config, policy } from '../src/index.js'
import type { HonoEnv, HS512Config } from '../src/index.js'
import { SignJWT } from 'jose'

describe('authGuardWithConfig middleware', () => {
  let app: Hono<HonoEnv>
  let config: HS512Config
  // Create a 64-byte secret for HS512 and encode as base64url
  const secretBytes = Buffer.alloc(64, 42) // Fill with value 42
  const secret = secretBytes.toString('base64url')
  const secretKey = new Uint8Array(secretBytes)
  const issuer = 'https://auth.test.example.com'
  const audience = 'api.test.example.com'

  beforeEach(() => {
    app = new Hono<HonoEnv>()
    config = createHS512Config(secret, {
      iss: issuer,
      aud: audience,
    })
  })

  /**
   * Helper to create tokens with explicit config (no environment)
   */
  async function createToken(payload: Record<string, unknown>): Promise<string> {
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('1h')

    if (payload.sub !== undefined) jwt.setSubject(payload.sub as string)

    return jwt.sign(secretKey)
  }

  describe('authentication with explicit config', () => {
    it('should authenticate valid token', async () => {
      app.get('/test', authGuardWithConfig(config), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const token = await createToken({ sub: 'user-123' })

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ sub: 'user-123' })
    })

    it('should inject auth into context', async () => {
      let capturedAuth = null

      app.get('/test', authGuardWithConfig(config), (c) => {
        capturedAuth = c.get('auth')
        return c.json({ ok: true })
      })

      const token = await createToken({
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      })

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      expect(res.status).toBe(200)
      expect(capturedAuth).toBeDefined()
      expect(capturedAuth).toMatchObject({
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      })
    })

    it('should reject request without Authorization header', async () => {
      app.get('/test', authGuardWithConfig(config), (c) => c.json({ ok: true }))

      const res = await app.request('/test')

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body).toEqual({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization or CF-Access-Jwt-Assertion header',
      })
    })

    it('should reject invalid token', async () => {
      app.get('/test', authGuardWithConfig(config), (c) => c.json({ ok: true }))

      const res = await app.request('/test', {
        headers: {
          Authorization: 'Bearer invalid.jwt.token',
        },
      })

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body).toEqual({
        error: 'unauthorized',
        message: 'Invalid or expired token',
      })
    })

    it('should reject token with wrong issuer', async () => {
      app.get('/test', authGuardWithConfig(config), (c) => c.json({ ok: true }))

      const encoder = new TextEncoder()
      const secretKey = encoder.encode(secret)

      const token = await new SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer('https://wrong-issuer.example.com')
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secretKey)

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      expect(res.status).toBe(401)
    })

    it('should reject token with wrong audience', async () => {
      app.get('/test', authGuardWithConfig(config), (c) => c.json({ ok: true }))

      const encoder = new TextEncoder()
      const secretKey = encoder.encode(secret)

      const token = await new SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer(issuer)
        .setAudience('wrong-audience')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secretKey)

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      expect(res.status).toBe(401)
    })

    it('should reject expired token', async () => {
      app.get('/test', authGuardWithConfig(config), (c) => c.json({ ok: true }))

      const encoder = new TextEncoder()
      const secretKey = encoder.encode(secret)

      const token = await new SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // Expired 1 hour ago
        .sign(secretKey)

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      expect(res.status).toBe(401)
    })

    it('should reject token signed with wrong secret', async () => {
      app.get('/test', authGuardWithConfig(config), (c) => c.json({ ok: true }))

      const encoder = new TextEncoder()
      const wrongSecret = 'wrong-secret-key-min-32-chars-long-for-hs512-algo'
      const secretKey = encoder.encode(wrongSecret)

      const token = await new SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secretKey)

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      expect(res.status).toBe(401)
    })
  })

  describe('authorization with policies', () => {
    it('should allow request when policy succeeds', async () => {
      const adminPolicy = policy().rolesAny('admin').build()

      app.get('/admin', authGuardWithConfig(config, adminPolicy), (c) => c.json({ ok: true }))

      const token = await createToken({
        sub: 'user-123',
        roles: ['admin'],
      })

      const res = await app.request('/admin', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      expect(res.status).toBe(200)
    })

    it('should reject request when policy fails', async () => {
      const adminPolicy = policy().rolesAny('admin').build()

      app.get('/admin', authGuardWithConfig(config, adminPolicy), (c) => c.json({ ok: true }))

      const token = await createToken({
        sub: 'user-123',
        roles: ['viewer'],
      })

      const res = await app.request('/admin', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

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

      app.get('/data', authGuardWithConfig(config, complexPolicy), (c) => c.json({ ok: true }))

      // Has roles but missing permissions
      const token1 = await createToken({
        sub: 'user-1',
        roles: ['admin'],
        permissions: ['read:data'],
      })
      const res1 = await app.request('/data', {
        headers: { Authorization: `Bearer ${token1}` },
      })
      expect(res1.status).toBe(403)

      // Has permissions but missing roles
      const token2 = await createToken({
        sub: 'user-2',
        roles: ['viewer'],
        permissions: ['read:data', 'write:data'],
      })
      const res2 = await app.request('/data', {
        headers: { Authorization: `Bearer ${token2}` },
      })
      expect(res2.status).toBe(403)

      // Has both roles and permissions
      const token3 = await createToken({
        sub: 'user-3',
        roles: ['analyst'],
        permissions: ['read:data', 'write:data'],
      })
      const res3 = await app.request('/data', {
        headers: { Authorization: `Bearer ${token3}` },
      })
      expect(res3.status).toBe(200)
    })
  })

  describe('multiple configs in same process', () => {
    it('should support different configs for different routes', async () => {
      // Create secrets for both services
      const secretBytesA = Buffer.alloc(64, 10)
      const secretA = secretBytesA.toString('base64url')
      const secretBytesB = Buffer.alloc(64, 20)
      const secretB = secretBytesB.toString('base64url')

      // Config for service A
      const configA = createHS512Config(secretA, {
        iss: 'https://auth-a.example.com',
        aud: 'service-a',
      })

      // Config for service B
      const configB = createHS512Config(secretB, {
        iss: 'https://auth-b.example.com',
        aud: 'service-b',
      })

      app.get('/service-a', authGuardWithConfig(configA), (c) => c.json({ service: 'A' }))
      app.get('/service-b', authGuardWithConfig(configB), (c) => c.json({ service: 'B' }))

      // Create token for service A
      const tokenA = await new SignJWT({ sub: 'user-a' })
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer('https://auth-a.example.com')
        .setAudience('service-a')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new Uint8Array(secretBytesA))

      // Create token for service B
      const tokenB = await new SignJWT({ sub: 'user-b' })
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer('https://auth-b.example.com')
        .setAudience('service-b')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new Uint8Array(secretBytesB))

      // Token A works on service A
      const resA1 = await app.request('/service-a', {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
      expect(resA1.status).toBe(200)

      // Token A fails on service B (wrong issuer/audience)
      const resA2 = await app.request('/service-b', {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
      expect(resA2.status).toBe(401)

      // Token B works on service B
      const resB1 = await app.request('/service-b', {
        headers: { Authorization: `Bearer ${tokenB}` },
      })
      expect(resB1.status).toBe(200)

      // Token B fails on service A (wrong issuer/audience)
      const resB2 = await app.request('/service-a', {
        headers: { Authorization: `Bearer ${tokenB}` },
      })
      expect(resB2.status).toBe(401)
    })
  })

  describe('no environment pollution', () => {
    it('should work without any environment variables', async () => {
      // This test verifies that authGuardWithConfig doesn't rely on
      // globalThis.__FLARELETTE_ENV or environment variables

      app.get('/test', authGuardWithConfig(config), (c) => {
        const auth = c.get('auth')
        return c.json({ sub: auth.sub })
      })

      const token = await createToken({ sub: 'user-123' })

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ sub: 'user-123' })

      // Verify no global state was mutated
      expect(
        (globalThis as typeof globalThis & { __FLARELETTE_ENV?: unknown }).__FLARELETTE_ENV
      ).toBeUndefined()
    })

    it('should not interfere with other explicit configs', async () => {
      // Create secrets for both configs
      const secretBytes1 = Buffer.alloc(64, 30)
      const secret1 = secretBytes1.toString('base64url')
      const secretBytes2 = Buffer.alloc(64, 40)
      const secret2 = secretBytes2.toString('base64url')

      const config1 = createHS512Config(secret1, {
        iss: 'https://issuer-1.example.com',
        aud: 'aud-1',
      })

      const config2 = createHS512Config(secret2, {
        iss: 'https://issuer-2.example.com',
        aud: 'aud-2',
      })

      app.get('/route1', authGuardWithConfig(config1), (c) => c.json({ route: 1 }))
      app.get('/route2', authGuardWithConfig(config2), (c) => c.json({ route: 2 }))

      const token1 = await new SignJWT({ sub: 'user-1' })
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer('https://issuer-1.example.com')
        .setAudience('aud-1')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new Uint8Array(secretBytes1))

      const token2 = await new SignJWT({ sub: 'user-2' })
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuer('https://issuer-2.example.com')
        .setAudience('aud-2')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new Uint8Array(secretBytes2))

      // Each token works with its own route
      const res1 = await app.request('/route1', {
        headers: { Authorization: `Bearer ${token1}` },
      })
      expect(res1.status).toBe(200)

      const res2 = await app.request('/route2', {
        headers: { Authorization: `Bearer ${token2}` },
      })
      expect(res2.status).toBe(200)

      // Cross-contamination should not occur
      const res3 = await app.request('/route1', {
        headers: { Authorization: `Bearer ${token2}` },
      })
      expect(res3.status).toBe(401)

      const res4 = await app.request('/route2', {
        headers: { Authorization: `Bearer ${token1}` },
      })
      expect(res4.status).toBe(401)
    })
  })
})
