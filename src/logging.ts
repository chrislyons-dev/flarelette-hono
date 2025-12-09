/**
 * Structured logging for Hono applications
 *
 * Provides ADR-0013 compliant structured logging using hono-pino.
 * This is a thin wrapper that configures pino with the correct schema
 * for polyglot microservice consistency.
 *
 * @module logging
 */

import type { MiddlewareHandler } from 'hono'

/**
 * Logger configuration options
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   service: 'bond-valuation',
 *   level: 'info'
 * })
 * ```
 */
export interface LoggerOptions {
  /**
   * Service name identifier
   *
   * This should match the service name used in gateway routing
   * and should be consistent across all log entries from this service.
   *
   * @example 'bond-valuation', 'gateway', 'daycount'
   */
  service: string

  /**
   * Logging level (default: 'info')
   *
   * Controls the minimum level of logs that will be output.
   * Production should typically use 'info', development can use 'debug'.
   */
  level?: 'debug' | 'info' | 'warn' | 'error'
}

/**
 * Format log level as string (ADR-0013 requirement)
 *
 * Pino formats levels as numbers by default, but ADR-0013 requires string levels.
 *
 * @param label - Log level label (e.g., 'info', 'error')
 * @returns Formatted level object
 * @internal
 */
export function formatLevel(label: string): { level: string } {
  return { level: label }
}

/**
 * Generate ISO 8601 timestamp for logs (ADR-0013 requirement)
 *
 * Returns current timestamp in ISO 8601 format with milliseconds,
 * formatted as a JSON fragment for Pino.
 *
 * @returns Formatted timestamp string
 * @internal
 */
export function generateTimestamp(): string {
  return `,"timestamp":"${new Date().toISOString()}"`
}

/**
 * Request ID extractor for correlation (ADR-0013 requirement)
 *
 * Returns undefined to let hono-pino automatically extract X-Request-ID header.
 * This enables distributed tracing across service boundaries.
 *
 * @returns Always undefined (handled by hono-pino)
 * @internal
 */
export function extractRequestId(): undefined {
  return undefined
}

/**
 * Create ADR-0013 compliant structured logger
 *
 * Returns a Hono middleware that automatically logs request start/completion
 * and provides a structured logger instance in the context.
 *
 * **ADR-0013 Schema:**
 * ```json
 * {
 *   "timestamp": "2025-11-02T12:34:56.789Z",
 *   "level": "info",
 *   "service": "bond-valuation",
 *   "requestId": "uuid-v4",
 *   "message": "Request completed",
 *   "duration": 125,
 *   "method": "POST",
 *   "path": "/api/price",
 *   "status": 200
 * }
 * ```
 *
 * **Request Correlation:**
 * The logger automatically extracts and propagates `X-Request-ID` header
 * for distributed tracing across service boundaries.
 *
 * @param options - Logger configuration
 * @returns Hono middleware for structured logging
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono'
 * import { createLogger } from '@chrislyons-dev/flarelette-hono'
 *
 * const app = new Hono()
 *
 * // Add structured logging middleware
 * app.use('*', createLogger({ service: 'bond-valuation' }))
 *
 * app.get('/price', async (c) => {
 *   // Access logger from context
 *   c.get('logger').info({ calculation: 'started' }, 'Calculating bond price')
 *   return c.json({ price: 99.948 })
 * })
 * ```
 *
 * @example
 * ```typescript
 * // Combine with auth middleware
 * app.use('*', createLogger({ service: 'my-service' }))
 * app.use('*', authGuard())
 *
 * app.post('/data', async (c) => {
 *   const logger = c.get('logger')
 *   const auth = c.get('auth')
 *
 *   logger.info({ userId: auth.sub }, 'Processing request')
 *   return c.json({ ok: true })
 * })
 * ```
 *
 * @throws {Error} If hono-pino is not installed
 */
export function createLogger(options: LoggerOptions): MiddlewareHandler {
  // Dynamic import to make hono-pino optional
  let pinoLogger: (config: unknown) => MiddlewareHandler
  let pino: (config: unknown) => unknown

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const honoPino = require('hono-pino') as { pinoLogger: (config: unknown) => MiddlewareHandler }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pinoModule = require('pino') as unknown

    pinoLogger = honoPino.pinoLogger
    pino =
      (pinoModule as { default?: (config: unknown) => unknown }).default ??
      (pinoModule as (config: unknown) => unknown)
  } catch {
    /* c8 ignore next 3 */
    // Coverage: This catch block cannot be tested when hono-pino is installed
    throw new Error(
      'hono-pino and pino are required for logging. Install with: npm install hono-pino pino'
    )
  }

  // Configure pino with ADR-0013 schema
  return pinoLogger({
    pino: pino({
      level: options.level ?? 'info',

      // Base fields included in all logs
      base: {
        service: options.service,
      },

      // Format level as string (not number)
      formatters: {
        level: formatLevel,
      },

      // ISO 8601 timestamp with milliseconds
      timestamp: generateTimestamp,
    }),

    // Extract X-Request-ID header for request correlation
    http: {
      // Request ID is automatically extracted from X-Request-ID header
      // and included in all logs for this request
      reqId: extractRequestId,
    },
  })
}

/**
 * Logger instance type
 *
 * This is the type of logger available in context via `c.get('logger')`
 * after applying the createLogger middleware.
 *
 * When hono-pino is available, this provides the full Pino logger interface.
 *
 * @example
 * ```typescript
 * import type { Logger } from '@chrislyons-dev/flarelette-hono'
 *
 * app.get('/data', async (c) => {
 *   const logger: Logger = c.get('logger')
 *
 *   logger.info({ userId: '123' }, 'User accessed data')
 *   logger.warn({ threshold: 100 }, 'Approaching rate limit')
 *   logger.error({ error: 'Connection failed' }, 'Database error')
 *
 *   return c.json({ ok: true })
 * })
 * ```
 */
export interface Logger {
  debug(obj: Record<string, unknown>, msg?: string): void
  debug(msg: string): void
  info(obj: Record<string, unknown>, msg?: string): void
  info(msg: string): void
  warn(obj: Record<string, unknown>, msg?: string): void
  warn(msg: string): void
  error(obj: Record<string, unknown>, msg?: string): void
  error(msg: string): void
}
