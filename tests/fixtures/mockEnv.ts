/**
 * Mock Cloudflare Workers environment for testing
 *
 * Provides test environment with JWT configuration.
 */

import type { WorkerEnv } from '@chrislyons-dev/flarelette-jwt'

/**
 * Create mock WorkerEnv for testing
 *
 * @param overrides - Optional environment variable overrides
 * @returns Mock WorkerEnv instance
 */
export function createMockEnv(overrides?: Partial<WorkerEnv>): WorkerEnv {
  // Generate a 64-byte (512-bit) secret for HS512
  // JWT_SECRET must be base64url-encoded (per flarelette-jwt usage guide)
  const rawSecret = Buffer.from('a'.repeat(64), 'utf-8')
  const defaultSecret = rawSecret.toString('base64url')

  return {
    JWT_ISS: 'https://test.internal',
    JWT_AUD: 'test-service',
    JWT_TTL_SECONDS: '3600',
    JWT_LEEWAY: '60',
    JWT_SECRET: defaultSecret,
    ...overrides,
  }
}
