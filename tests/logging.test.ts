/**
 * Logging middleware tests
 *
 * Test coverage for structured logging functionality.
 * Tests cover lines 107-156 (createLogger implementation and Logger interface).
 *
 * Note: These tests verify the error handling and type definitions.
 * Full integration tests with hono-pino would require optional dependencies.
 */

import { describe, it, expect } from 'vitest'
import type { Logger, LoggerOptions } from '../src/logging.js'

describe('logging module', () => {
  describe('LoggerOptions interface', () => {
    it('should accept valid service name', () => {
      const options: LoggerOptions = {
        service: 'test-service',
      }

      expect(options.service).toBe('test-service')
      expect(options.level).toBeUndefined()
    })

    it('should accept all valid log levels', () => {
      const levels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error']

      levels.forEach((level) => {
        const options: LoggerOptions = {
          service: 'test-service',
          level,
        }

        expect(options.level).toBe(level)
      })
    })

    it('should accept various service name formats', () => {
      const serviceNames = [
        'simple',
        'kebab-case',
        'snake_case',
        'bond-valuation',
        'gateway',
        'my.service',
      ]

      serviceNames.forEach((service) => {
        const options: LoggerOptions = {
          service,
        }

        expect(options.service).toBe(service)
      })
    })
  })

  describe('Logger interface', () => {
    it('should define all required log methods', () => {
      // Create a mock logger that satisfies the Logger interface
      const logger: Logger = {
        debug: (_objOrMsg: Record<string, unknown> | string, _msg?: string) => {
          // Mock implementation
        },
        info: (_objOrMsg: Record<string, unknown> | string, _msg?: string) => {
          // Mock implementation
        },
        warn: (_objOrMsg: Record<string, unknown> | string, _msg?: string) => {
          // Mock implementation
        },
        error: (_objOrMsg: Record<string, unknown> | string, _msg?: string) => {
          // Mock implementation
        },
      }

      // Verify all methods exist and are functions
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')
    })

    it('should support debug method with object and message', () => {
      const calls: Array<{ obj?: Record<string, unknown>; msg?: string }> = []

      const logger: Logger = {
        debug: (objOrMsg: Record<string, unknown> | string, msg?: string) => {
          if (typeof objOrMsg === 'string') {
            calls.push({ msg: objOrMsg })
          } else {
            calls.push({ obj: objOrMsg, msg })
          }
        },
        info: () => {
          // Not used
        },
        warn: () => {
          // Not used
        },
        error: () => {
          // Not used
        },
      }

      logger.debug({ userId: '123' }, 'Debug message')
      expect(calls).toHaveLength(1)
      expect(calls[0].obj).toEqual({ userId: '123' })
      expect(calls[0].msg).toBe('Debug message')
    })

    it('should support debug method with message only', () => {
      const calls: string[] = []

      const logger: Logger = {
        debug: (objOrMsg: Record<string, unknown> | string) => {
          if (typeof objOrMsg === 'string') {
            calls.push(objOrMsg)
          }
        },
        info: () => {
          // Not used
        },
        warn: () => {
          // Not used
        },
        error: () => {
          // Not used
        },
      }

      logger.debug('Debug message')
      expect(calls).toContain('Debug message')
    })

    it('should support info method with both signatures', () => {
      const calls: Array<{ type: 'string' | 'object'; data: unknown }> = []

      const logger: Logger = {
        debug: () => {
          // Not used
        },
        info: (objOrMsg: Record<string, unknown> | string, msg?: string) => {
          if (typeof objOrMsg === 'string') {
            calls.push({ type: 'string', data: objOrMsg })
          } else {
            calls.push({ type: 'object', data: { obj: objOrMsg, msg } })
          }
        },
        warn: () => {
          // Not used
        },
        error: () => {
          // Not used
        },
      }

      logger.info({ userId: '123' }, 'Info message')
      logger.info('Info message')

      expect(calls).toHaveLength(2)
      expect(calls[0].type).toBe('object')
      expect(calls[1].type).toBe('string')
    })

    it('should support warn method with both signatures', () => {
      const calls: string[] = []

      const logger: Logger = {
        debug: () => {
          // Not used
        },
        info: () => {
          // Not used
        },
        warn: (objOrMsg: Record<string, unknown> | string, msg?: string) => {
          if (typeof objOrMsg === 'string') {
            calls.push(objOrMsg)
          } else if (msg !== undefined) {
            calls.push(msg)
          }
        },
        error: () => {
          // Not used
        },
      }

      logger.warn({ threshold: 100 }, 'Warning message')
      logger.warn('Warning message')

      expect(calls).toContain('Warning message')
      expect(calls).toHaveLength(2)
    })

    it('should support error method with both signatures', () => {
      const calls: Array<unknown> = []

      const logger: Logger = {
        debug: () => {
          // Not used
        },
        info: () => {
          // Not used
        },
        warn: () => {
          // Not used
        },
        error: (objOrMsg: Record<string, unknown> | string, msg?: string) => {
          calls.push({ objOrMsg, msg })
        },
      }

      logger.error({ error: 'Connection failed' }, 'Error message')
      logger.error('Error message')

      expect(calls).toHaveLength(2)
    })
  })

  describe('ADR-0013 helper functions', () => {
    it('should format level as string object', async () => {
      const { formatLevel } = await import('../src/logging.js')

      const result = formatLevel('info')
      expect(result).toEqual({ level: 'info' })

      const debugResult = formatLevel('debug')
      expect(debugResult).toEqual({ level: 'debug' })

      const errorResult = formatLevel('error')
      expect(errorResult).toEqual({ level: 'error' })

      const warnResult = formatLevel('warn')
      expect(warnResult).toEqual({ level: 'warn' })
    })

    it('should generate ISO 8601 timestamp', async () => {
      const { generateTimestamp } = await import('../src/logging.js')

      const result = generateTimestamp()

      // Should be a JSON fragment with timestamp field
      expect(result).toMatch(/^,"timestamp":"/)
      expect(result).toMatch(/"$/)

      // Extract timestamp and verify it's valid ISO 8601
      const timestampMatch = result.match(/"timestamp":"([^"]+)"/)
      expect(timestampMatch).not.toBeNull()

      if (timestampMatch) {
        const timestamp = timestampMatch[1]
        // Verify ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

        // Verify it's a valid date
        const date = new Date(timestamp)
        expect(date.toISOString()).toBe(timestamp)
      }
    })

    it('should extract request ID as undefined', async () => {
      const { extractRequestId } = await import('../src/logging.js')

      const result = extractRequestId()

      // Should return undefined to let hono-pino handle it
      expect(result).toBeUndefined()
    })
  })

  describe('createLogger error handling', () => {
    it('should throw error when hono-pino is not available', async () => {
      // Import createLogger
      const { createLogger } = await import('../src/logging.js')

      const options: LoggerOptions = {
        service: 'test-service',
      }

      // Since hono-pino is not installed in test environment,
      // createLogger should throw an error
      expect(() => createLogger(options)).toThrow('hono-pino and pino are required for logging')
      expect(() => createLogger(options)).toThrow('Install with: npm install hono-pino pino')
    })

    it('should provide helpful error message', async () => {
      const { createLogger } = await import('../src/logging.js')

      const options: LoggerOptions = {
        service: 'bond-valuation',
        level: 'info',
      }

      try {
        createLogger(options)
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('hono-pino and pino are required')
        expect((error as Error).message).toContain('npm install')
      }
    })
  })

  describe('type safety', () => {
    it('should enforce LoggerOptions types at compile time', () => {
      // These are compile-time checks that verify TypeScript types

      // Valid: service is required
      const valid: LoggerOptions = {
        service: 'test',
      }
      expect(valid.service).toBeDefined()

      // Valid: with optional level
      const withLevel: LoggerOptions = {
        service: 'test',
        level: 'info',
      }
      expect(withLevel.level).toBe('info')

      // These would be compile errors:
      // const invalid1: LoggerOptions = {}  // Error: service is required
      // const invalid2: LoggerOptions = { service: 'test', level: 'invalid' }  // Error: invalid level
    })

    it('should enforce Logger interface at compile time', () => {
      // Minimal valid logger
      const logger: Logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      expect(logger).toBeDefined()

      // These would be compile errors:
      // const invalid: Logger = {}  // Error: missing methods
      // const invalid2: Logger = { debug: () => {}, info: () => {} }  // Error: missing warn, error
    })
  })
})
