/**
 * Type system tests
 *
 * Tests for HonoEnv generic type and custom bindings integration.
 * Validates that the intersection approach allows extending bindings
 * while maintaining type safety.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authGuard } from '../src/index.js'
import type { HonoEnv } from '../src/index.js'
import { createTestToken } from './fixtures/tokens.js'
import { createMockEnv } from './fixtures/mockEnv.js'

/**
 * Custom bindings interface for testing
 *
 * Simulates a real-world scenario where a service has additional
 * Cloudflare bindings beyond the JWT configuration.
 */
interface CustomBindings {
  // D1 database binding
  DB: {
    prepare: (query: string) => {
      bind: (...params: unknown[]) => {
        first: () => Promise<Record<string, unknown> | null>
        all: () => Promise<{ results: Record<string, unknown>[] }>
      }
    }
  }
  // R2 bucket binding
  BUCKET: {
    get: (key: string) => Promise<{ body: ReadableStream } | null>
    put: (key: string, value: string) => Promise<void>
  }
  // Service binding
  GATEWAY: {
    fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  }
  // Secret binding
  API_KEY: string
}

describe('HonoEnv generic types', () => {
  describe('default usage (no custom bindings)', () => {
    let app: Hono<HonoEnv>
    let env: HonoEnv['Bindings']

    beforeEach(() => {
      app = new Hono<HonoEnv>()
      env = createMockEnv()
    })

    it('should work with default HonoEnv type', async () => {
      app.get('/test', authGuard(), (c) => {
        const auth = c.get('auth')
        // Access JWT configuration from WorkerEnv
        const iss = c.env.JWT_ISS
        return c.json({ sub: auth.sub, iss })
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
      expect(body).toEqual({
        sub: 'user-123',
        iss: env.JWT_ISS,
      })
    })

    it('should provide access to all WorkerEnv properties', async () => {
      app.get('/config', authGuard(), (c) => {
        return c.json({
          iss: c.env.JWT_ISS,
          aud: c.env.JWT_AUD,
          ttl: c.env.JWT_TTL_SECONDS,
          leeway: c.env.JWT_LEEWAY,
        })
      })

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/config',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        iss: env.JWT_ISS,
        aud: env.JWT_AUD,
      })
    })
  })

  describe('custom bindings', () => {
    let app: Hono<HonoEnv<CustomBindings>>
    let env: HonoEnv<CustomBindings>['Bindings']

    beforeEach(() => {
      app = new Hono<HonoEnv<CustomBindings>>()
      const baseEnv = createMockEnv()

      // Create extended environment with custom bindings
      env = {
        ...baseEnv,
        DB: {
          prepare: (): {
            bind: (...params: unknown[]) => {
              first: () => Promise<Record<string, unknown> | null>
              all: () => Promise<{ results: Record<string, unknown>[] }>
            }
          } => ({
            bind: (
              ..._params: unknown[]
            ): {
              first: () => Promise<Record<string, unknown> | null>
              all: () => Promise<{ results: Record<string, unknown>[] }>
            } => ({
              first: async (): Promise<Record<string, unknown> | null> =>
                await Promise.resolve({ id: 1, name: 'test' }),
              all: async (): Promise<{ results: Record<string, unknown>[] }> =>
                await Promise.resolve({ results: [{ id: 1, name: 'test' }] }),
            }),
          }),
        },
        BUCKET: {
          get: async (): Promise<{ body: ReadableStream } | null> => await Promise.resolve(null),
          put: async (): Promise<void> => await Promise.resolve(),
        },
        GATEWAY: {
          fetch: async (): Promise<Response> =>
            await Promise.resolve(new Response('{}', { status: 200 })),
        },
        API_KEY: 'test-api-key-12345',
      }
    })

    it('should access custom bindings in authenticated handler', async () => {
      app.get('/data', authGuard(), async (c) => {
        const auth = c.get('auth')

        // Access custom DB binding
        const result = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
          .bind(auth.sub)
          .first()

        return c.json({ user: result })
      })

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/data',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({
        user: { id: 1, name: 'test' },
      })
    })

    it('should access both custom bindings and WorkerEnv properties', async () => {
      app.get('/combined', authGuard(), (c) => {
        const auth = c.get('auth')

        // Access custom bindings
        const apiKey = c.env.API_KEY

        // Access JWT configuration from WorkerEnv
        const iss = c.env.JWT_ISS
        const aud = c.env.JWT_AUD

        return c.json({
          sub: auth.sub,
          apiKey,
          iss,
          aud,
        })
      })

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/combined',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({
        sub: 'user-123',
        apiKey: 'test-api-key-12345',
        iss: env.JWT_ISS,
        aud: env.JWT_AUD,
      })
    })

    it('should access R2 bucket binding', async () => {
      app.get('/storage', authGuard(), async (c) => {
        const auth = c.get('auth')
        const key = `user-${auth.sub}/data.json`

        // Access R2 bucket
        const object = await c.env.BUCKET.get(key)

        return c.json({
          exists: object !== null,
        })
      })

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/storage',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({
        exists: false,
      })
    })

    it('should access service binding', async () => {
      app.get('/gateway', authGuard(), async (c) => {
        // Access service binding
        const response = await c.env.GATEWAY.fetch('https://api.example.com/data')
        const data = await response.json()

        return c.json({ data })
      })

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/gateway',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
    })

    it('should work with multiple custom bindings in single handler', async () => {
      app.post('/complex', authGuard(), async (c) => {
        const auth = c.get('auth')

        // Use DB
        const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
          .bind(auth.sub)
          .first()

        // Use BUCKET
        await c.env.BUCKET.put(`user-${auth.sub}/profile.json`, JSON.stringify(user))

        // Use GATEWAY
        await c.env.GATEWAY.fetch('https://api.example.com/notify', {
          method: 'POST',
          body: JSON.stringify({ userId: auth.sub }),
        })

        // Use API_KEY
        const apiKey = c.env.API_KEY

        return c.json({
          success: true,
          user,
          apiKey: apiKey.substring(0, 4) + '***',
        })
      })

      const token = await createTestToken({ sub: 'user-123' }, env)

      const res = await app.request(
        '/complex',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        success: true,
        user: { id: 1, name: 'test' },
        apiKey: 'test***',
      })
    })
  })

  describe('type safety compilation tests', () => {
    it('should enforce auth variable type', async () => {
      const app = new Hono<HonoEnv>()
      const env = createMockEnv()

      app.get('/test', authGuard(), (c) => {
        return c.json({ ok: true })
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
    })

    it('should enforce WorkerEnv properties on default type', async () => {
      const app = new Hono<HonoEnv>()
      const env = createMockEnv()

      app.get('/test', authGuard(), (c) => {
        // These should all be valid WorkerEnv properties
        return c.json({ ok: true })
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
    })
  })
})
