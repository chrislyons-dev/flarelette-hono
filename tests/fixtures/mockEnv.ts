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
  const defaultSecret = 'a'.repeat(64)

  return {
    JWT_ISS: 'https://test.internal',
    JWT_AUD: 'test-service',
    JWT_TTL_SECONDS: '3600',
    JWT_LEEWAY: '60',
    JWT_SECRET: defaultSecret,
    ...overrides,
  }
}
