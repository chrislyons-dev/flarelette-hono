/**
 * Authentication middleware for Hono
 *
 * Provides JWT authentication and authorization for Hono applications on Cloudflare Workers.
 *
 * @module middleware
 * @uses types environment and policy types
 *
 */

import type { Context, MiddlewareHandler } from 'hono'
import { adapters, verifyWithConfig } from '@chrislyons-dev/flarelette-jwt'
import type { HonoEnv, Policy, VerifyConfig } from './types.js'

/**
 * Extract Bearer token from Authorization header
 *
 * @param authHeader - Authorization header value
 * @returns Token string if valid Bearer token, null otherwise
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (authHeader === undefined || authHeader.length === 0) {
    return null
  }

  // Split on whitespace, filtering out empty strings to handle multiple spaces
  const parts = authHeader.trim().split(/\s+/)
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  const token = parts[1]
  if (token === undefined || token.length === 0) {
    return null
  }

  return token
}

/**
 * Authentication guard middleware
 *
 * Verifies JWT tokens and optionally enforces authorization policies.
 * Injects verified payload into context as `auth` variable.
 *
 * @param policy - Optional policy to enforce after authentication
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * // Authentication only
 * app.get('/protected', authGuard(), async (c) => {
 *   const auth = c.get('auth')
 *   return c.json({ user: auth.sub })
 * })
 *
 * // With authorization policy
 * const adminPolicy = policy().rolesAny('admin').build()
 * app.get('/admin', authGuard(adminPolicy), async (c) => {
 *   return c.json({ admin: true })
 * })
 * ```
 */
export function authGuard<T = Record<string, never>>(
  policy?: Policy
): MiddlewareHandler<HonoEnv<T>> {
  return async (c: Context<HonoEnv<T>>, next) => {
    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization')
    const token = extractBearerToken(authHeader)

    if (token === null) {
      return c.json(
        {
          error: 'unauthorized',
          message: 'Missing or invalid Authorization header',
        },
        401
      )
    }

    // Verify token using flarelette-jwt
    // c.env is typed as T & WorkerEnv (intersection), which satisfies makeKit's requirements
    const kit = adapters.makeKit(c.env)
    const payload = await kit.verify(token)

    // Fail-silent verification: null indicates any verification failure
    if (payload === null) {
      return c.json(
        {
          error: 'unauthorized',
          message: 'Invalid or expired token',
        },
        401
      )
    }

    // Evaluate policy if provided
    if (policy) {
      const result = policy.evaluate(payload)
      if (!result.success) {
        return c.json(
          {
            error: 'forbidden',
            message: 'Insufficient permissions',
          },
          403
        )
      }
    }

    // Inject verified payload into context
    c.set('auth', payload)

    return next()
  }
}

/**
 * Authentication guard middleware with explicit configuration
 *
 * Verifies JWT tokens using explicit configuration objects instead of environment variables.
 * This approach is ideal for testing, multi-tenant scenarios, or when you want to avoid
 * environment variable dependencies.
 *
 * @param config - JWT verification configuration (HS512Config or EdDSAVerifyConfig)
 * @param policy - Optional policy to enforce after authentication
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * import { authGuardWithConfig, createHS512Config } from '@chrislyons-dev/flarelette-hono'
 *
 * const config = createHS512Config({
 *   issuer: 'https://auth.example.com',
 *   audience: 'api.example.com',
 *   secret: 'your-secret-key'
 * })
 *
 * // Authentication only
 * app.get('/protected', authGuardWithConfig(config), async (c) => {
 *   const auth = c.get('auth')
 *   return c.json({ user: auth.sub })
 * })
 *
 * // With authorization policy
 * const adminPolicy = policy().rolesAny('admin').build()
 * app.get('/admin', authGuardWithConfig(config, adminPolicy), async (c) => {
 *   return c.json({ admin: true })
 * })
 * ```
 */
export function authGuardWithConfig<T = Record<string, never>>(
  config: VerifyConfig,
  policy?: Policy
): MiddlewareHandler<HonoEnv<T>> {
  return async (c: Context<HonoEnv<T>>, next) => {
    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization')
    const token = extractBearerToken(authHeader)

    if (token === null) {
      return c.json(
        {
          error: 'unauthorized',
          message: 'Missing or invalid Authorization header',
        },
        401
      )
    }

    // Verify token using explicit configuration
    const payload = await verifyWithConfig(token, config)

    // Fail-silent verification: null indicates any verification failure
    if (payload === null) {
      return c.json(
        {
          error: 'unauthorized',
          message: 'Invalid or expired token',
        },
        401
      )
    }

    // Evaluate policy if provided
    if (policy) {
      const result = policy.evaluate(payload)
      if (!result.success) {
        return c.json(
          {
            error: 'forbidden',
            message: 'Insufficient permissions',
          },
          403
        )
      }
    }

    // Inject verified payload into context
    c.set('auth', payload)

    return next()
  }
}
