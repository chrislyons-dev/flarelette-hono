/**
 * Type definitions for flarelette-hono
 *
 * Re-exports types from @chrislyons-dev/flarelette-jwt and defines Hono-specific types.
 *
 * @module types
 *
 */

// Re-export all types from flarelette-jwt
export type {
  JwtPayload,
  ActorClaim,
  WorkerEnv,
  AlgType,
  JwtValue,
} from '@chrislyons-dev/flarelette-jwt'

/**
 * Hono environment interface for type-safe context
 *
 * Extends WorkerEnv with Hono's Variables for authenticated context access.
 */
export interface HonoEnv {
  Bindings: import('@chrislyons-dev/flarelette-jwt').WorkerEnv & {
    // Additional custom bindings (index signature allows any additional bindings)
    [key: string]: import('@chrislyons-dev/flarelette-jwt').JwtValue
  }
  Variables: {
    // Injected by authGuard middleware after successful authentication
    auth: import('@chrislyons-dev/flarelette-jwt').JwtPayload
  }
}

/**
 * Policy evaluation result - discriminated union for type-safe error handling
 */
export type PolicyResult = { success: true } | { success: false; reason: string }

/**
 * Authorization policy interface
 *
 * Policies evaluate JWT claims to determine if access should be granted.
 */
export interface Policy {
  /**
   * Evaluate policy against JWT payload
   *
   * @param payload - Verified JWT payload to evaluate
   * @returns PolicyResult indicating success or failure with reason
   */
  evaluate(payload: import('@chrislyons-dev/flarelette-jwt').JwtPayload): PolicyResult
}

/**
 * Policy builder interface for fluent API construction
 */
export interface PolicyBuilder {
  /**
   * Require at least one of the specified roles
   *
   * Checks the `roles` claim (string array) in the JWT payload.
   *
   * @param roles - Role names to check (at least one must match)
   */
  rolesAny(...roles: string[]): PolicyBuilder

  /**
   * Require all of the specified roles
   *
   * Checks the `roles` claim (string array) in the JWT payload.
   *
   * @param roles - Role names to check (all must match)
   */
  rolesAll(...roles: string[]): PolicyBuilder

  /**
   * Require at least one of the specified permissions
   *
   * Checks the `permissions` claim (string array) in the JWT payload.
   *
   * @param permissions - Permission names to check (at least one must match)
   */
  needAny(...permissions: string[]): PolicyBuilder

  /**
   * Require all of the specified permissions
   *
   * Checks the `permissions` claim (string array) in the JWT payload.
   *
   * @param permissions - Permission names to check (all must match)
   */
  needAll(...permissions: string[]): PolicyBuilder

  /**
   * Build the final policy
   *
   * @returns Immutable Policy instance
   */
  build(): Policy
}
