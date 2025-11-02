/**
 * flarelette-hono - Type-safe JWT authentication middleware for Hono
 *
 * Framework adapter for Cloudflare Workers built on Hono + Flarelette JWT.
 * Provides declarative JWT authentication and policy enforcement.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono'
 * import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
 * import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'
 *
 * const app = new Hono<HonoEnv>()
 *
 * // Authentication only
 * app.get('/protected', authGuard(), async (c) => {
 *   const auth = c.get('auth')
 *   return c.json({ user: auth.sub })
 * })
 *
 * // With authorization policy
 * const adminPolicy = policy()
 *   .rolesAny('admin')
 *   .needAll('write:users')
 *   .build()
 *
 * app.get('/admin', authGuard(adminPolicy), async (c) => {
 *   return c.json({ admin: true })
 * })
 * ```
 *
 * @module main
 * @uses middleware authentication middleware
 * @uses policy-builder policy builder
 *
 */

// Core middleware
export { authGuard } from './middleware.js'

// Policy builder
export { policy } from './policy.js'

// Type exports
export type {
  HonoEnv,
  Policy,
  PolicyBuilder,
  PolicyResult,
  // Re-export types from flarelette-jwt
  JwtPayload,
  ActorClaim,
  WorkerEnv,
  AlgType,
  JwtValue,
} from './types.js'
