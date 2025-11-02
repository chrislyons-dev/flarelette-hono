/**
 * Integration tests
 *
 * End-to-end tests for complete authentication and authorization workflows.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authGuard, policy } from '../src/index.js'
import type { HonoEnv } from '../src/index.js'
import { createTestToken } from './fixtures/tokens.js'
import { createMockEnv } from './fixtures/mockEnv.js'

describe('integration tests', () => {
  let app: Hono<HonoEnv>
  let env: HonoEnv['Bindings']

  beforeEach(() => {
    app = new Hono<HonoEnv>()
    env = createMockEnv()
  })

  describe('realistic application scenarios', () => {
    it('should implement a complete API with multiple protection levels', async () => {
      // Public routes
      app.get('/health', (c) => c.json({ status: 'ok' }))

      // Authenticated routes
      app.get('/profile', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({
          id: auth.sub,
          email: auth.email,
          name: auth.name,
        })
      })

      // Role-based routes
      const adminPolicy = policy().rolesAny('admin', 'superuser').build()
      app.get('/admin/users', authGuard(adminPolicy), (c) => c.json({ users: [] }))

      // Permission-based routes
      const writePolicy = policy().needAll('write:data').build()
      app.post('/data', authGuard(writePolicy), (c) => c.json({ created: true }))

      // Complex policy routes
      const analyticsPolicy = policy()
        .rolesAny('admin', 'analyst')
        .needAny('read:analytics', 'read:reports')
        .build()
      app.get('/analytics', authGuard(analyticsPolicy), (c) => c.json({ data: [] }))

      // Test public route
      const res1 = await app.request('/health', {}, env)
      expect(res1.status).toBe(200)

      // Test authenticated route
      const userToken = await createTestToken(
        {
          sub: 'user-123',
          email: 'user@example.com',
          name: 'Test User',
        },
        env
      )
      const res2 = await app.request(
        '/profile',
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
        env
      )
      expect(res2.status).toBe(200)
      const profile = await res2.json()
      expect(profile).toEqual({
        id: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
      })

      // Test admin route with admin user
      const adminToken = await createTestToken(
        {
          sub: 'admin-123',
          roles: ['admin'],
        },
        env
      )
      const res3 = await app.request(
        '/admin/users',
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        env
      )
      expect(res3.status).toBe(200)

      // Test admin route with regular user (should fail)
      const res4 = await app.request(
        '/admin/users',
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
        env
      )
      expect(res4.status).toBe(403)

      // Test write route with permission
      const writerToken = await createTestToken(
        {
          sub: 'writer-123',
          permissions: ['write:data'],
        },
        env
      )
      const res5 = await app.request(
        '/data',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${writerToken}` },
        },
        env
      )
      expect(res5.status).toBe(200)

      // Test write route without permission
      const res6 = await app.request(
        '/data',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${userToken}` },
        },
        env
      )
      expect(res6.status).toBe(403)

      // Test analytics route with analyst
      const analystToken = await createTestToken(
        {
          sub: 'analyst-123',
          roles: ['analyst'],
          permissions: ['read:analytics'],
        },
        env
      )
      const res7 = await app.request(
        '/analytics',
        {
          headers: { Authorization: `Bearer ${analystToken}` },
        },
        env
      )
      expect(res7.status).toBe(200)

      // Test analytics route with admin (has role but no permission)
      const res8 = await app.request(
        '/analytics',
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        env
      )
      expect(res8.status).toBe(403)
    })

    it('should handle multi-tenant scenarios', async () => {
      // Middleware that checks org_id
      app.get('/orgs/:orgId/data', authGuard(), (c) => {
        const auth = c.get('auth')
        const orgId = c.req.param('orgId')

        if (auth.org_id !== orgId) {
          return c.json({ error: 'forbidden' }, 403)
        }

        return c.json({ orgId, data: [] })
      })

      // User from org-123
      const org123Token = await createTestToken(
        {
          sub: 'user-123',
          org_id: 'org-123',
        },
        env
      )

      // Access own org data
      const res1 = await app.request(
        '/orgs/org-123/data',
        {
          headers: { Authorization: `Bearer ${org123Token}` },
        },
        env
      )
      expect(res1.status).toBe(200)

      // Try to access different org data
      const res2 = await app.request(
        '/orgs/org-456/data',
        {
          headers: { Authorization: `Bearer ${org123Token}` },
        },
        env
      )
      expect(res2.status).toBe(403)
    })

    it('should handle delegated token scenarios (RFC 8693)', async () => {
      // Service acting on behalf of user
      const delegatedToken = await createTestToken(
        {
          sub: 'user-123',
          act: {
            sub: 'service-worker',
            iss: 'https://internal-services.example.com',
          },
        },
        env
      )

      app.get('/data', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({
          user: auth.sub,
          actingService: auth.act?.sub,
        })
      })

      const res = await app.request(
        '/data',
        {
          headers: { Authorization: `Bearer ${delegatedToken}` },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({
        user: 'user-123',
        actingService: 'service-worker',
      })
    })

    it('should work with nested routes and middleware composition', async () => {
      // Create sub-app with authentication
      const adminApp = new Hono<HonoEnv>()
      const adminPolicy = policy().rolesAny('admin').build()

      adminApp.use('*', authGuard(adminPolicy))
      adminApp.get('/users', (c) => c.json({ users: [] }))
      adminApp.get('/settings', (c) => c.json({ settings: {} }))

      // Mount sub-app
      app.route('/admin', adminApp)

      const adminToken = await createTestToken(
        {
          sub: 'admin-123',
          roles: ['admin'],
        },
        env
      )

      const userToken = await createTestToken(
        {
          sub: 'user-123',
          roles: ['viewer'],
        },
        env
      )

      // Admin can access
      const res1 = await app.request(
        '/admin/users',
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        env
      )
      expect(res1.status).toBe(200)

      const res2 = await app.request(
        '/admin/settings',
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        env
      )
      expect(res2.status).toBe(200)

      // Regular user cannot access
      const res3 = await app.request(
        '/admin/users',
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
        env
      )
      expect(res3.status).toBe(403)
    })

    it('should handle OIDC-like claims', async () => {
      app.get('/userinfo', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({
          sub: auth.sub,
          name: auth.name,
          email: auth.email,
          email_verified: auth.email_verified,
          picture: auth.picture,
          updated_at: auth.updated_at,
        })
      })

      const token = await createTestToken(
        {
          sub: 'user-123',
          name: 'John Doe',
          email: 'john@example.com',
          email_verified: true,
          picture: 'https://example.com/avatar.jpg',
          updated_at: 1640000000,
        },
        env
      )

      const res = await app.request(
        '/userinfo',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        sub: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        email_verified: true,
      })
    })

    it('should handle custom claims', async () => {
      app.get('/profile', authGuard(), (c) => {
        const auth = c.get('auth')
        return c.json({
          sub: auth.sub,
          department: auth.department,
          employeeId: auth.employee_id,
          customData: auth.custom_data,
        })
      })

      const token = await createTestToken(
        {
          sub: 'user-123',
          department: 'engineering',
          employee_id: 'EMP-456',
          custom_data: { tier: 'premium', credits: 100 },
        },
        env
      )

      const res = await app.request(
        '/profile',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        sub: 'user-123',
        department: 'engineering',
        employeeId: 'EMP-456',
      })
    })
  })

  describe('error handling workflows', () => {
    it('should provide consistent error responses across routes', async () => {
      app.get('/route1', authGuard(), (c) => c.json({ ok: true }))
      app.get('/route2', authGuard(), (c) => c.json({ ok: true }))
      app.get('/route3', authGuard(), (c) => c.json({ ok: true }))

      // Test missing token on all routes
      const res1 = await app.request('/route1', {}, env)
      const res2 = await app.request('/route2', {}, env)
      const res3 = await app.request('/route3', {}, env)

      expect(res1.status).toBe(401)
      expect(res2.status).toBe(401)
      expect(res3.status).toBe(401)

      const body1 = await res1.json()
      const body2 = await res2.json()
      const body3 = await res3.json()

      expect(body1).toEqual(body2)
      expect(body2).toEqual(body3)
      expect(body1).toEqual({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header',
      })
    })

    it('should handle authorization failures consistently', async () => {
      const adminPolicy = policy().rolesAny('admin').build()

      app.get('/admin1', authGuard(adminPolicy), (c) => c.json({ ok: true }))
      app.get('/admin2', authGuard(adminPolicy), (c) => c.json({ ok: true }))

      const userToken = await createTestToken(
        {
          sub: 'user-123',
          roles: ['viewer'],
        },
        env
      )

      const res1 = await app.request(
        '/admin1',
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
        env
      )
      const res2 = await app.request(
        '/admin2',
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
        env
      )

      expect(res1.status).toBe(403)
      expect(res2.status).toBe(403)

      const body1 = await res1.json()
      const body2 = await res2.json()

      expect(body1).toEqual(body2)
      expect(body1).toEqual({
        error: 'forbidden',
        message: 'Insufficient permissions',
      })
    })
  })
})
