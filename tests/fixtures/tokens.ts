/**
 * Test token utilities
 *
 * Provides helpers for creating valid and invalid JWT tokens for testing.
 */

import { adapters, sign } from '@chrislyons-dev/flarelette-jwt'
import type { JwtPayload, JwtValue, WorkerEnv } from '@chrislyons-dev/flarelette-jwt'
import { SignJWT } from 'jose'
import { createMockEnv } from './mockEnv.js'

/**
 * Create a test token with custom claims
 *
 * @param payload - JWT payload claims
 * @param env - Optional custom environment (defaults to mock env)
 * @returns Signed JWT token string
 */
export async function createTestToken(
  payload: Partial<JwtPayload>,
  env?: WorkerEnv
): Promise<string> {
  const testEnv = env ?? createMockEnv()
  adapters.bindEnv(testEnv)

  const fullPayload: JwtPayload = {
    iss: testEnv.JWT_ISS,
    aud: testEnv.JWT_AUD,
    sub: 'test-user',
    ...payload,
  }

  return sign(fullPayload, { ttlSeconds: 3600 })
}

/**
 * Create a token with specific roles
 *
 * @param roles - Role names to include
 * @param env - Optional custom environment
 * @returns Signed JWT token string
 */
export async function createTokenWithRoles(roles: string[], env?: WorkerEnv): Promise<string> {
  return createTestToken({ roles }, env)
}

/**
 * Create a token with specific permissions
 *
 * @param permissions - Permission names to include
 * @param env - Optional custom environment
 * @returns Signed JWT token string
 */
export async function createTokenWithPermissions(
  permissions: string[],
  env?: WorkerEnv
): Promise<string> {
  return createTestToken({ permissions }, env)
}

/**
 * Create a mock JWT token with arbitrary claims
 *
 * This function creates tokens directly using jose, bypassing the sign() function.
 * Used for testing validation failures (expired, wrong issuer, wrong audience).
 * Does NOT enforce issuer/audience constraints like sign() does.
 *
 * @param payload - JWT payload with arbitrary claims
 * @param secret - Secret key for signing (defaults to test secret)
 * @returns Signed JWT token string
 */
export async function createMockToken(
  payload: Record<string, unknown>,
  secret: string = 'test-secret-key-min-32-chars-long-for-hs512-algorithm'
): Promise<string> {
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(secret)

  const jwt = new SignJWT(payload)

  // Set claims exactly as provided (no overrides)
  if (payload.iss !== undefined) {
    const iss = payload.iss as JwtValue
    if (typeof iss === 'string') jwt.setIssuer(iss)
  }
  if (payload.aud !== undefined) {
    const aud = payload.aud as JwtValue
    if (typeof aud === 'string' || Array.isArray(aud)) jwt.setAudience(aud)
  }
  if (payload.sub !== undefined) jwt.setSubject(payload.sub as string)
  if (payload.iat !== undefined) jwt.setIssuedAt(payload.iat as number)
  if (payload.exp !== undefined) jwt.setExpirationTime(payload.exp as number)

  return jwt.setProtectedHeader({ alg: 'HS512' }).sign(secretKey)
}

/**
 * Create an expired token
 *
 * Uses createMockToken() to bypass sign() validation and create a token
 * with an expiration time in the past.
 *
 * @param env - Optional custom environment (for issuer/audience claims)
 * @returns Signed JWT token string (already expired)
 */
export async function createExpiredToken(env?: WorkerEnv): Promise<string> {
  const testEnv = env ?? createMockEnv()

  return createMockToken({
    iss: testEnv.JWT_ISS,
    aud: testEnv.JWT_AUD,
    sub: 'test-user',
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  })
}

/**
 * Create an invalid token (malformed JWT)
 *
 * @returns Invalid JWT string
 */
export function createInvalidToken(): string {
  return 'invalid.jwt.token'
}

/**
 * Create a token with wrong issuer
 *
 * Uses createMockToken() to bypass sign() validation and create a token
 * with an issuer that doesn't match the configured JWT_ISS.
 *
 * @param env - Optional custom environment (for audience claim)
 * @returns Signed JWT token string with wrong issuer
 */
export async function createTokenWithWrongIssuer(env?: WorkerEnv): Promise<string> {
  const testEnv = env ?? createMockEnv()

  return createMockToken({
    iss: 'https://wrong-issuer.example.com', // Wrong issuer
    aud: testEnv.JWT_AUD, // Correct audience
    sub: 'test-user',
    exp: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
  })
}

/**
 * Create a token with wrong audience
 *
 * Uses createMockToken() to bypass sign() validation and create a token
 * with an audience that doesn't match the configured JWT_AUD.
 *
 * @param env - Optional custom environment (for issuer claim)
 * @returns Signed JWT token string with wrong audience
 */
export async function createTokenWithWrongAudience(env?: WorkerEnv): Promise<string> {
  const testEnv = env ?? createMockEnv()

  return createMockToken({
    iss: testEnv.JWT_ISS, // Correct issuer
    aud: 'wrong-audience', // Wrong audience
    sub: 'test-user',
    exp: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
  })
}
