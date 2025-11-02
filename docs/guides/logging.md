# Structured Logging

**Status**: Recommended Practice
**Standard**: ADR-0013
**Last Updated**: 2025-11-02

---

## Overview

Structured logging ensures consistency across polyglot microservices. All services (TypeScript, Python, Java) output logs in the same JSON format for easy aggregation, searching, and correlation.

**`flarelette-hono` provides an optional `createLogger()` helper** that configures `hono-pino` to follow ADR-0013 standards.

---

## Why Structured Logging?

### Log Aggregation
Services output consistent JSON that log aggregators (CloudWatch, Datadog, etc.) can parse without custom configuration.

### Request Tracing
`requestId` field correlates logs across service boundaries for distributed tracing.

### Type Safety
Pino provides typed logging interfaces for TypeScript applications.

### Performance
Pino uses zero-copy JSON serialization optimized for edge runtimes.

---

## Installation

```bash
npm install hono-pino pino
# or
pnpm add hono-pino pino
```

**Note**: These are **optional** dependencies. Only install if you want structured logging.

---

## Quick Start

### 1. Add Logger Middleware

```typescript
import { Hono } from 'hono'
import { createLogger, authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Add structured logging (before other middleware)
app.use('*', createLogger({ service: 'bond-valuation' }))

// Add auth middleware
app.use('*', authGuard())

app.get('/price', async (c) => {
  const logger = c.get('logger')
  const auth = c.get('auth')

  logger.info({ userId: auth.sub }, 'Calculating bond price')

  return c.json({ price: 99.948 })
})

export default app
```

### 2. Automatic Request/Response Logging

The middleware automatically logs:

**Request Start:**
```json
{
  "timestamp": "2025-11-02T12:34:56.123Z",
  "level": "info",
  "service": "bond-valuation",
  "requestId": "a3f2c1b0-1234-5678-9abc-def012345678",
  "msg": "incoming request",
  "req": {
    "method": "POST",
    "url": "/api/price"
  }
}
```

**Request Completed:**
```json
{
  "timestamp": "2025-11-02T12:34:56.248Z",
  "level": "info",
  "service": "bond-valuation",
  "requestId": "a3f2c1b0-1234-5678-9abc-def012345678",
  "msg": "request completed",
  "res": {
    "statusCode": 200
  },
  "responseTime": 125
}
```

---

## ADR-0013 Schema

All logs follow this standard schema:

```json
{
  "timestamp": "2025-11-02T12:34:56.789Z",
  "level": "info|warn|error",
  "service": "gateway|daycount|valuation|pricing|analytics",
  "requestId": "uuid-v4",
  "msg": "Human-readable message",
  "duration": 125,
  "userId": "auth0|123",
  "context": {}
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `string` | ISO 8601 with milliseconds |
| `level` | `string` | One of: `debug`, `info`, `warn`, `error` |
| `service` | `string` | Service identifier |
| `msg` | `string` | Human-readable message |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `requestId` | `string` | UUID v4 for request correlation |
| `userId` | `string` | User identifier from JWT |
| `duration` | `number` | Duration in milliseconds |
| `context` | `object` | Additional structured data |

---

## Configuration

### Basic Configuration

```typescript
import { createLogger } from '@chrislyons-dev/flarelette-hono'

// Minimal configuration
app.use('*', createLogger({ service: 'my-service' }))

// With custom log level
app.use('*', createLogger({
  service: 'my-service',
  level: 'debug',  // debug, info, warn, error
}))
```

### Log Levels

| Level | When to Use |
|-------|-------------|
| `debug` | Development only - verbose details |
| `info` | Production - key events, request completion |
| `warn` | Recoverable issues, rate limits approaching |
| `error` | Unhandled errors, failures |

**Recommendation**: Use `info` in production, `debug` in development.

---

## Usage Patterns

### Basic Logging

```typescript
app.get('/data', async (c) => {
  const logger = c.get('logger')

  logger.info('Processing request')
  logger.warn({ threshold: 100 }, 'Approaching rate limit')
  logger.error({ error: 'Connection timeout' }, 'Database error')

  return c.json({ ok: true })
})
```

### Logging with Context

```typescript
app.post('/calculate', async (c) => {
  const logger = c.get('logger')
  const auth = c.get('auth')
  const body = await c.req.json()

  // Log with structured context
  logger.info(
    {
      userId: auth.sub,
      operation: 'bond_pricing',
      cusip: body.cusip,
    },
    'Starting calculation'
  )

  const result = await calculate(body)

  logger.info(
    {
      userId: auth.sub,
      price: result.price,
      duration: result.durationMs,
    },
    'Calculation completed'
  )

  return c.json(result)
})
```

### Error Logging

```typescript
app.post('/valuation', async (c) => {
  const logger = c.get('logger')

  try {
    const result = await performValuation()
    return c.json(result)
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Valuation failed'
    )

    return c.json({ error: 'Internal server error' }, 500)
  }
})
```

### Performance Logging

```typescript
app.get('/reports', async (c) => {
  const logger = c.get('logger')
  const start = Date.now()

  const reports = await fetchReports()

  logger.info(
    {
      count: reports.length,
      duration: Date.now() - start,
    },
    'Reports fetched'
  )

  return c.json({ reports })
})
```

---

## Request Correlation

### X-Request-ID Header

The logger automatically extracts `X-Request-ID` from request headers for distributed tracing.

**Flow:**

1. Gateway generates `requestId` (UUID v4)
2. Gateway adds `X-Request-ID` header to downstream requests
3. Services extract `requestId` from header
4. All logs include same `requestId` for end-to-end tracing

**Example:**

```typescript
// Gateway
import { v4 as uuidv4 } from 'uuid'

app.post('/api/*', async (c) => {
  const requestId = uuidv4()

  // Forward to downstream service with request ID
  const response = await c.env.DOWNSTREAM_SERVICE.fetch(c.req.raw, {
    headers: {
      ...c.req.header(),
      'X-Request-ID': requestId,
    },
  })

  return response
})
```

```typescript
// Downstream service (automatic)
app.use('*', createLogger({ service: 'downstream' }))

app.post('/process', async (c) => {
  const logger = c.get('logger')

  // Request ID is automatically extracted and included in logs
  logger.info('Processing request')
  // Output includes: "requestId": "a3f2c1b0-1234-5678-9abc-def012345678"

  return c.json({ ok: true })
})
```

---

## Combining with Auth

**Order matters**: Add logger before auth middleware.

```typescript
import { Hono } from 'hono'
import { createLogger, authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// 1. Add logging first
app.use('*', createLogger({ service: 'my-service' }))

// 2. Add auth middleware
app.use('*', authGuard())

app.post('/data', async (c) => {
  const logger = c.get('logger')
  const auth = c.get('auth')

  // Log with user context
  logger.info(
    {
      userId: auth.sub,
      roles: auth.roles,
    },
    'User accessed data'
  )

  return c.json({ ok: true })
})
```

---

## Best Practices

### 1. Log at Appropriate Level

```typescript
// ✅ Good - Info for key events
logger.info({ userId: auth.sub }, 'User authenticated')

// ❌ Bad - Debug in production
logger.debug({ token: jwt }, 'Token received')  // Never log tokens!
```

### 2. Include Structured Context

```typescript
// ✅ Good - Structured data
logger.info({ cusip: 'ABC123', price: 99.948 }, 'Bond priced')

// ❌ Bad - Unstructured string interpolation
logger.info(`Priced bond ${cusip} at ${price}`)
```

### 3. Never Log Secrets

```typescript
// ❌ Bad - Logging sensitive data
logger.info({ token: jwt }, 'Authentication')
logger.info({ password: pwd }, 'Login attempt')
logger.info({ apiKey: key }, 'API call')

// ✅ Good - Log non-sensitive identifiers only
logger.info({ userId: auth.sub }, 'Authentication')
logger.info({ username: user }, 'Login attempt')
logger.info({ service: 'external-api' }, 'API call')
```

### 4. Keep Messages Concise

```typescript
// ✅ Good - Clear, actionable message
logger.error({ error: err.message }, 'Database connection failed')

// ❌ Bad - Verbose, redundant
logger.error({ error: err.message }, 'An error occurred while trying to connect to the database and the connection was refused')
```

### 5. Use Context for Details

```typescript
// ✅ Good - Message + context
logger.info(
  {
    cusip: 'ABC123',
    settlementDate: '2025-12-01',
    couponRate: 0.05,
  },
  'Bond calculation started'
)

// ❌ Bad - Everything in message
logger.info('Bond calculation started for CUSIP ABC123 with settlement 2025-12-01 and coupon 0.05')
```

---

## TypeScript Types

### Logger Type

```typescript
import type { Logger } from '@chrislyons-dev/flarelette-hono'

app.get('/data', async (c) => {
  const logger: Logger = c.get('logger')

  // Typed methods
  logger.debug({ msg: 'Debug message' })
  logger.info({ userId: '123' }, 'Info message')
  logger.warn({ threshold: 100 }, 'Warning message')
  logger.error({ error: 'Failed' }, 'Error message')
})
```

### LoggerOptions Type

```typescript
import type { LoggerOptions } from '@chrislyons-dev/flarelette-hono'

const options: LoggerOptions = {
  service: 'my-service',
  level: 'info',
}

app.use('*', createLogger(options))
```

---

## Testing

### Mock Logger in Tests

```typescript
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'

describe('Logging', () => {
  it('logs request events', async () => {
    const app = new Hono()

    // Note: In tests, logger might be undefined if hono-pino not installed
    // Handle gracefully in production code

    app.get('/test', (c) => {
      const logger = c.get('logger')
      if (logger) {
        logger.info({ test: true }, 'Test log')
      }
      return c.json({ ok: true })
    })

    const res = await app.request('/test')
    expect(res.status).toBe(200)
  })
})
```

---

## Production Deployment

### Environment-Based Configuration

```typescript
const logLevel = process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info'

app.use('*', createLogger({
  service: 'my-service',
  level: logLevel,
}))
```

### Cloudflare Workers

Logs are automatically sent to Cloudflare Workers logs and can be viewed via:

- `wrangler tail` (real-time)
- Cloudflare Dashboard (Logs tab)
- Log aggregation services (via log push)

---

## Log Aggregation

### CloudWatch (AWS)

Send logs to CloudWatch via Cloudflare Workers Log Push:

1. Configure log destination in Cloudflare dashboard
2. Logs automatically pushed to CloudWatch
3. Query with CloudWatch Insights using JSON fields

**Example Query:**
```sql
fields timestamp, level, service, requestId, msg
| filter service = "bond-valuation"
| filter level = "error"
| sort timestamp desc
```

### Datadog

Similar setup:

1. Configure Datadog as log destination
2. Logs automatically indexed by JSON fields
3. Query and visualize with Datadog Log Explorer

---

## Comparison to Python Flarelette

| Feature | Python `flarelette` | TypeScript `flarelette-hono` |
|---------|---------------------|------------------------------|
| **Logger** | `StructuredLogger` class | `createLogger()` helper |
| **Library** | `python-json-logger` | `hono-pino` + `pino` |
| **Schema** | ADR-0013 compliant | ADR-0013 compliant |
| **Middleware** | `LoggingMiddleware` | Automatic via `createLogger()` |
| **Request ID** | Automatic extraction | Automatic extraction |

Both implementations follow the same ADR-0013 schema for consistency.

---

## Advanced Usage

### Custom Pino Configuration

For advanced use cases, use `hono-pino` directly:

```typescript
import { pinoLogger } from 'hono-pino'
import { pino } from 'pino'

const customLogger = pinoLogger({
  pino: pino({
    level: 'info',
    base: { service: 'my-service' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,

    // Custom serializers
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        // Add custom fields
      }),
    },

    // Redact sensitive fields
    redact: ['password', 'apiKey', 'token'],
  }),
})

app.use('*', customLogger)
```

---

## Summary

Structured logging is recommended for production services. Use `createLogger()` for ADR-0013 compliance:

```typescript
import { Hono } from 'hono'
import { createLogger, authGuard } from '@chrislyons-dev/flarelette-hono'

const app = new Hono()

// Add logging (before auth)
app.use('*', createLogger({ service: 'my-service' }))
app.use('*', authGuard())

app.post('/data', async (c) => {
  const logger = c.get('logger')
  const auth = c.get('auth')

  logger.info({ userId: auth.sub }, 'Processing request')

  return c.json({ ok: true })
})
```

**Key Benefits:**
- ✅ Consistent JSON schema across all services
- ✅ Request correlation via `X-Request-ID`
- ✅ Type-safe logging interface
- ✅ Zero-copy JSON serialization
- ✅ Log aggregation ready

---

## References

- [ADR-0013 - Structured Logging Standards](https://github.com/chrislyons-dev/bond-math/blob/main/docs/adr/0013-structured-logging-standards.md)
- [hono-pino Documentation](https://github.com/maou-shonen/hono-pino)
- [Pino Documentation](https://getpino.io/)
- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/)
