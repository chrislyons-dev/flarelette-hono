# Flarelette-Hono

> **Framework adapter for Cloudflare Workers built on Hono + Flarelette JWT.**
> Provides clean, declarative JWT authentication and policy enforcement for micro-APIs running on Cloudflare.

<p align="center">
  <img src="docs/images/flarelette-light-mode-512.png" alt="Flarelette Logo" width="256" />
</p>

---

## Overview

`flarelette-hono` is the **Hono adapter** for the [`@chrislyons-dev/flarelette-jwt`](https://www.npmjs.com/package/@chrislyons-dev/flarelette-jwt) toolkit.
It adds route-level middleware, context helpers, and environment injection for a fully self-contained API stack.

| Layer | Responsibility |
|-------|----------------|
| **@chrislyons-dev/flarelette-jwt** | Low-level JWT signing, verification, key handling (HS512 + EdDSA) |
| **flarelette-hono** | Middleware, guards, request/response helpers for Hono |
| **Your Worker** | Application logic, routes, business rules |

---

## Design Philosophy

**Flarelette-Hono is an auth middleware for Hono, not a full framework.**

Unlike the Python `flarelette` package (which is a complete micro-framework similar to Flask), `flarelette-hono` is **intentionally minimal**:

- **Python flarelette**: Full framework (routing, middleware, auth, validation, logging, service factory)
- **TypeScript flarelette-hono**: Auth middleware for existing Hono framework (JWT auth + optional logging helper)

**Why this approach?**

Hono is already an excellent edge framework — we don't rewrite it. Instead, `flarelette-hono` adds what's missing for feature compatibility with Python flarelette:

✅ **JWT authentication** via `authGuard()` middleware
✅ **Policy-based authorization** via `policy()` builder
✅ **Structured logging** via optional `createLogger()` helper (ADR-0013 compliance)
✅ **Type-safe context** via `HonoEnv` extension

Everything else (routing, error handling, request/response, middleware chaining) is **Hono's responsibility**.

---

## Features

- **Framework-native**: integrates seamlessly with [Hono](https://hono.dev) on Cloudflare Workers
- **JWT middleware**: declarative `authGuard(policy)` for route protection
- **Role/permission policies**: simple fluent builder (`policy().rolesAny().needAll()`)
- **Env injection**: automatically wires Cloudflare bindings (`env`) into jwt-kit
- **Framework-agnostic core**: built directly atop `@chrislyons-dev/flarelette-jwt`
- **Environment-driven**: Configuration via environment variables — no config files required
- **Type-safe**: 100% TypeScript with strict typing — no `any` types

---

## Quick Start

### 1. Install

```bash
# Core dependencies
npm install hono @chrislyons-dev/flarelette-jwt @chrislyons-dev/flarelette-hono

# Strongly recommended: Input validation
npm install zod @hono/zod-validator

# Or with pnpm
pnpm add hono @chrislyons-dev/flarelette-jwt @chrislyons-dev/flarelette-hono
pnpm add zod @hono/zod-validator
```

### 2. Configure Environment

Set required environment variables in `wrangler.toml`:

```toml
[vars]
JWT_ISS = "https://gateway.internal"
JWT_AUD = "your-service-name"
JWT_SECRET_NAME = "INTERNAL_JWT_SECRET"
```

Generate and store secret:

```bash
openssl rand -base64 48 | wrangler secret put INTERNAL_JWT_SECRET
```

### 3. Minimal Example (Authentication Only)

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Public endpoint (no auth required)
app.get('/health', (c) => c.json({ ok: true }))

// Protected endpoint (requires valid JWT)
app.get('/protected', authGuard(), async (c) => {
  const auth = c.get('auth')
  return c.json({ message: 'Hello', user: auth.sub })
})

export default app
```

### 4. Example with Policies (Authorization)

Once you understand basic authentication, add role-based access control:

```typescript
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'

// Define a policy
const analystPolicy = policy()
  .rolesAny('analyst', 'admin')
  .needAll('read:reports')

// Protect a route with policy
app.get('/reports', authGuard(analystPolicy), async (c) => {
  const auth = c.get('auth')
  return c.json({ ok: true, sub: auth.sub, roles: auth.roles })
})
```

See [API Design](docs/api-design.md) for complete policy builder reference.

### 5. Input Validation (Required for Security)

**Input validation is a critical security boundary.** All endpoints that accept input must validate it.

We strongly recommend using [Zod](https://zod.dev/) for type-safe runtime validation:

```bash
npm install zod @hono/zod-validator
```

Combine authentication + validation:

```typescript
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

// Define validation schema
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().positive().optional(),
})

// Apply auth + validation middleware
app.post(
  '/users',
  authGuard(policy().rolesAny('admin')),    // JWT auth + policy
  zValidator('json', createUserSchema),      // Input validation
  async (c) => {
    const auth = c.get('auth')               // Typed JWT payload
    const body = c.req.valid('json')         // Typed validated input

    return c.json({ ok: true })
  }
)
```

**See [Input Validation Guide](docs/validation.md) for complete security best practices.**

### 6. Structured Logging (Optional, Recommended for Production)

**Structured logging ensures consistency across polyglot microservices** (ADR-0013 compliance).

Install logging dependencies:

```bash
npm install hono-pino pino
```

Add structured logging middleware:

```typescript
import { createLogger } from '@chrislyons-dev/flarelette-hono'

// Add logging middleware (before auth)
app.use('*', createLogger({ service: 'bond-valuation' }))
app.use('*', authGuard())

app.post('/calculate', async (c) => {
  const logger = c.get('logger')
  const auth = c.get('auth')

  // Structured logging with context
  logger.info(
    { userId: auth.sub, operation: 'calculate' },
    'Processing calculation'
  )

  return c.json({ result: 42 })
})
```

**Output (JSON):**
```json
{
  "timestamp": "2025-11-02T12:34:56.789Z",
  "level": "info",
  "service": "bond-valuation",
  "requestId": "a3f2c1b0-1234-5678-9abc",
  "userId": "auth0|123",
  "operation": "calculate",
  "msg": "Processing calculation"
}
```

**See [Structured Logging Guide](docs/logging.md) for ADR-0013 standards and best practices.**

### 7. Test Your Setup

Start development server:

```bash
wrangler dev
```

Test protected endpoint:

```bash
# This will return 401 (expected - no JWT)
curl http://localhost:8787/protected

# Generate test JWT and make authenticated request
# (See examples/ directory for token generation utilities)
```

### 8. Wrangler Config Example

```toml
name = "bond-consumer"
main = "src/app.ts"
compatibility_date = "2025-10-01"

[[services]]
binding = "GATEWAY"
service = "bond-gateway"

[vars]
JWT_ISS = "https://gateway.internal"
JWT_AUD = "bond-math.api"
```

---

### Next Steps

- **Basic usage**: See examples above for authentication and policies
- **Advanced authorization**: Read [API Design](docs/api-design.md#policy-builder) for complex policies
- **Production deployment**: Review [JWT Integration](docs/jwt-integration.md#configuration-strategies) for EdDSA setup
- **Testing**: See [CONTRIBUTING.md](CONTRIBUTING.md#testing-requirements) for test patterns

---

## API Summary

### `authGuard(policy?)`

Hono middleware that:

* extracts the `Authorization: Bearer <jwt>` header
* validates via jwt-kit
* enforces the given policy (if provided)
* injects the verified claims into `c.set('auth', payload)`

If validation fails → returns `401 Unauthorized` or `403 Forbidden`.

```typescript
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'

// Require authentication only
app.get('/protected', authGuard(), async (c) => {
  const auth = c.get('auth')
  return c.json({ user: auth.sub })
})

// Require authentication + policy
app.get('/admin', authGuard(policy().rolesAny('admin')), async (c) => {
  return c.json({ message: 'Admin only' })
})
```

### `policy()`

Fluent builder for permission rules:

```typescript
policy()
  .rolesAny('admin', 'analyst')         // At least one role required
  .rolesAll('verified', 'approved')     // All roles required
  .needAny('read:data', 'read:reports') // At least one permission required
  .needAll('write:reports', 'audit:log') // All permissions required
```

### Context Helpers

```typescript
import type { AuthContext } from '@chrislyons-dev/flarelette-hono'

app.get('/data', authGuard(), async (c) => {
  // Access verified JWT payload
  const auth: AuthContext = c.get('auth')

  // auth.sub: string
  // auth.iss: string
  // auth.aud: string
  // auth.roles?: string[]
  // auth.permissions?: string[]
  // auth.actor?: ActorClaim
})
```

---

## Configuration (shared with jwt-kit)

| Variable                                   | Description                                    |
| ------------------------------------------ | ---------------------------------------------- |
| `JWT_ISS`, `JWT_AUD`                       | Expected issuer & audience                     |
| `JWT_TTL_SECONDS`, `JWT_LEEWAY`            | Defaults: 900 / 90                             |
| `JWT_SECRET_NAME` / `JWT_SECRET`           | HS512 secret                                   |
| `JWT_PRIVATE_JWK_NAME` / `JWT_PRIVATE_JWK` | EdDSA signing key (gateway)                    |
| `JWT_JWKS_URL_NAME` / `JWT_JWKS_URL`       | EdDSA verification (URL mode)                  |
| `setJwksResolver()`                        | For internal Service Bindings (no public JWKS) |

---

## Documentation

- [Architecture](docs/architecture.md) - System design and component overview
- [API Design](docs/api-design.md) - Complete API reference and examples
- [JWT Integration](docs/jwt-integration.md) - Token structure, configuration strategies, and patterns
- **[Input Validation](docs/validation.md) - Security best practices for validating all input with Zod**
- **[Structured Logging](docs/logging.md) - ADR-0013 compliant logging for polyglot microservices**
- [Contributing](CONTRIBUTING.md) - Development setup and guidelines

---

## Testing Tips

* Run integration tests in Miniflare with `JWT_SECRET` or a stubbed resolver
* Use `@chrislyons-dev/flarelette-jwt` CLI to generate 64-byte secrets for HS512
* Mock the JWKS resolver in local tests:

  ```typescript
  import { setJwksResolver } from '@chrislyons-dev/flarelette-jwt'

  setJwksResolver(async () => ({ keys: [mockPublicJwk] }))
  ```

---

## Roadmap

* [ ] Optional mTLS / Access integration for external JWKS
* [ ] KV-backed replay store (`jti`)
* [ ] Rich error handling hooks (`onUnauthorized`, `onForbidden`)
* [ ] OpenAPI/Swagger integration

---

## Security First

JWT authentication and input validation are critical security boundaries. This library prioritizes security over convenience:

### Authentication Security
- **Fail securely**: Invalid tokens return `401`, insufficient permissions return `403`
- **No detail leakage**: Error messages never expose token structure or validation details
- **Short-lived tokens**: 5-15 minute TTL recommended
- **Audience validation**: Prevents token reuse across services

### Input Validation Security
- **Validate all input**: Every endpoint that accepts data must validate it
- **Use Zod**: Type-safe runtime validation prevents injection attacks and type confusion
- **Constrain everything**: String lengths, array sizes, numeric ranges, formats
- **Never trust input**: Even from authenticated users

### Type Safety
- **100% strict TypeScript**: No `any` types throughout the codebase
- **Runtime + compile-time validation**: Zod provides both type inference and runtime checks
- **Strong typing prevents vulnerabilities**: Type confusion and injection attacks are mitigated

See [JWT Integration Guide](docs/jwt-integration.md) and [Input Validation Guide](docs/validation.md) for detailed security considerations.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Code style guidelines (strict TypeScript, no `any`)
- Testing requirements
- Pull request process

---

## License

MIT © Chris Lyons

Part of the **Flarelette** micro-API toolkit for Cloudflare Workers.

---

## Related Projects

- [@chrislyons-dev/flarelette-jwt](https://www.npmjs.com/package/@chrislyons-dev/flarelette-jwt) - JWT toolkit for Cloudflare Workers
- [Hono](https://hono.dev) - Ultrafast web framework for the edge
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) - Serverless platform
