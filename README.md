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

| Layer                              | Responsibility                                                    |
| ---------------------------------- | ----------------------------------------------------------------- |
| **@chrislyons-dev/flarelette-jwt** | Low-level JWT signing, verification, key handling (HS512 + EdDSA) |
| **flarelette-hono**                | Middleware, guards, request/response helpers for Hono             |
| **Your Worker**                    | Application logic, routes, business rules                         |

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
- **Explicit configuration**: `authGuardWithConfig()` for testing and multi-tenant scenarios
- **Role/permission policies**: simple fluent builder (`policy().rolesAny().needAll()`)
- **Env injection**: automatically wires Cloudflare bindings (`env`) into jwt-kit
- **Framework-agnostic core**: built directly atop `@chrislyons-dev/flarelette-jwt`
- **Dual configuration modes**: Environment-driven or explicit config objects
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
# IMPORTANT: v1.13+ requires 64-byte minimum for HS512
npx flarelette-jwt-secret --len=64 | wrangler secret put INTERNAL_JWT_SECRET
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
const analystPolicy = policy().rolesAny('analyst', 'admin').needAll('read:reports')

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
  authGuard(policy().rolesAny('admin')), // JWT auth + policy
  zValidator('json', createUserSchema), // Input validation
  async (c) => {
    const auth = c.get('auth') // Typed JWT payload
    const body = c.req.valid('json') // Typed validated input

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
  logger.info({ userId: auth.sub, operation: 'calculate' }, 'Processing calculation')

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

## Explicit Configuration (New!)

The traditional `authGuard()` middleware reads JWT configuration from environment variables (`JWT_ISS`, `JWT_AUD`, `JWT_SECRET_NAME`, etc.). This works well for most cases but can be challenging for:

- **Testing**: Setting up environment variables for unit tests
- **Multi-tenant apps**: Different JWT configs for different routes
- **Development**: Avoiding global state mutation

**Solution**: Use `authGuardWithConfig()` with explicit configuration objects:

```typescript
import { authGuardWithConfig, createHS512Config } from '@chrislyons-dev/flarelette-hono'

// Create explicit JWT configuration
const config = createHS512Config(
  'your-base64url-encoded-secret', // Base64url-encoded secret (32+ bytes)
  {
    iss: 'https://auth.example.com',
    aud: 'api.example.com',
  }
)

// Use in middleware (no environment variables needed!)
app.get('/protected', authGuardWithConfig(config), async (c) => {
  const auth = c.get('auth')
  return c.json({ user: auth.sub })
})

// Works with policies too
const adminPolicy = policy().rolesAny('admin').build()
app.get('/admin', authGuardWithConfig(config, adminPolicy), async (c) => {
  return c.json({ admin: true })
})
```

### Multi-Tenant Example

Different routes can use different JWT configurations in the same process:

```typescript
const tenantAConfig = createHS512Config(secretA, {
  iss: 'https://auth-tenant-a.example.com',
  aud: 'tenant-a',
})

const tenantBConfig = createHS512Config(secretB, {
  iss: 'https://auth-tenant-b.example.com',
  aud: 'tenant-b',
})

app.get('/tenant-a/*', authGuardWithConfig(tenantAConfig), tenantAHandlers)
app.get('/tenant-b/*', authGuardWithConfig(tenantBConfig), tenantBHandlers)
```

### Testing Benefits

Explicit configuration makes testing much easier:

```typescript
import { createHS512Config, authGuardWithConfig } from '@chrislyons-dev/flarelette-hono'
import { SignJWT } from 'jose'

// Test setup (no environment pollution!)
const testSecret = Buffer.alloc(32, 42).toString('base64url')
const testConfig = createHS512Config(testSecret, {
  iss: 'test-issuer',
  aud: 'test-audience',
})

// Create test token
const token = await new SignJWT({ sub: 'test-user' })
  .setProtectedHeader({ alg: 'HS512' })
  .setIssuer('test-issuer')
  .setAudience('test-audience')
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(Buffer.from(testSecret, 'base64url'))

// Test authenticated request
const res = await app.request('/protected', {
  headers: { Authorization: `Bearer ${token}` },
})
```

**When to use each approach:**

- **Environment-based (`authGuard`)**: Production deployments, standard Workers with env vars
- **Explicit config (`authGuardWithConfig`)**: Testing, multi-tenant apps, development, avoiding global state

Both approaches are fully supported and can be mixed in the same application!

---

## Gateway and Service Mesh Architecture

Typical flarelette deployments use a **gateway pattern** where external OIDC tokens are verified at the gateway, which then mints internal tokens for the service mesh.

**Both gateway and internal services use `flarelette-hono`** — the only difference is the **JWKS resolution strategy**:

| Component | JWKS Source | Purpose |
|-----------|-------------|---------|
| **Gateway** | `JWT_JWKS_URL` (HTTP) | Verify external OIDC tokens (Auth0, Okta, CF Access) |
| **Internal Services** | `JWT_JWKS_SERVICE_NAME` (binding) | Verify internal tokens from gateway (fast RPC) |

### Gateway Example

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import { sign } from '@chrislyons-dev/flarelette-jwt'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Verify external OIDC tokens via JWT_JWKS_URL
app.post('/token-exchange', authGuard(), async (c) => {
  const externalAuth = c.get('auth')

  // Mint internal token for service mesh
  const internalToken = await sign({
    sub: externalAuth.sub,
    email: externalAuth.email,
    roles: deriveRoles(externalAuth),
    permissions: derivePermissions(externalAuth)
  })

  return c.json({ token: internalToken })
})
```

```toml
# Gateway wrangler.toml
[vars]
JWT_ISS = "https://auth0.example.com/"
JWT_AUD = "my-app-client-id"
JWT_JWKS_URL = "https://auth0.example.com/.well-known/jwks.json"

# For minting internal tokens
JWT_PRIVATE_JWK_NAME = "GATEWAY_PRIVATE_KEY"
```

### Internal Service Example

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Verify internal tokens via service binding
app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')
  return c.json({ data: [], user: auth.sub })
})
```

```toml
# Service wrangler.toml
[[services]]
binding = "GATEWAY"
service = "jwt-gateway"

[vars]
JWT_ISS = "https://gateway.internal"
JWT_AUD = "bond-math.api"
JWT_JWKS_SERVICE_NAME = "GATEWAY"
```

**See [Configuration Guide](docs/getting-started/configuration.md#gateway-and-service-mesh-architecture) for complete examples.**

---

## Cloudflare Access Integration

Workers behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) can authenticate users via the `CF-Access-Jwt-Assertion` header. This header contains a JWT issued by Cloudflare after successful authentication.

**Note:** Cloudflare Access uses **standard JWKS format** (RFC 7517) but with a non-standard path (`/cdn-cgi/access/certs`). It does not provide an OIDC discovery endpoint. This is fine — `authGuard()` supports direct JWKS URLs.

### How It Works

Cloudflare Access acts as an authentication layer before requests reach your Worker:

1. User authenticates via Access (SSO, OIDC, etc.)
2. Cloudflare injects `CF-Access-Jwt-Assertion` header with signed JWT
3. Your Worker validates the JWT using `authGuard()`

**No code changes required** — `authGuard()` automatically checks both `Authorization` and `CF-Access-Jwt-Assertion` headers.

### Header Precedence

When both headers are present, `Authorization` takes priority:

```typescript
// Authorization header is checked first
// CF-Access-Jwt-Assertion is used as fallback if Authorization is missing or invalid
```

This allows you to:
- Use Cloudflare Access for browser-based users (`CF-Access-Jwt-Assertion`)
- Use API tokens for service-to-service calls (`Authorization: Bearer`)

### Configuration

Configure `authGuard()` to verify Cloudflare Access JWTs:

```typescript
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Works with both Authorization and CF-Access-Jwt-Assertion headers
app.get('/protected', authGuard(), async (c) => {
  const auth = c.get('auth')
  return c.json({ user: auth.sub, email: auth.email })
})
```

**Environment variables:**

```toml
# wrangler.toml
[vars]
JWT_ISS = "https://your-team.cloudflareaccess.com"  # Cloudflare Access issuer
JWT_AUD = "your-application-aud-tag"                # Application audience tag
```

Get your team domain and audience tag from the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/).

### Verify Cloudflare Access Tokens

Set up JWKS verification for Cloudflare Access public keys:

```toml
# wrangler.toml
[vars]
JWT_ISS = "https://your-team.cloudflareaccess.com"
JWT_AUD = "your-application-aud-tag"

# JWKS URL is a public endpoint - no need for secret
JWT_JWKS_URL = "https://your-team.cloudflareaccess.com/cdn-cgi/access/certs"
```

**Security note:** Cloudflare Access uses short-lived JWTs (typically 1 hour). Set appropriate `JWT_LEEWAY` to handle clock skew.

### Mixed Authentication Example

Support both Cloudflare Access (browser) and API tokens (service-to-service):

```typescript
// Browser users → Cloudflare Access → CF-Access-Jwt-Assertion header
// API clients → Direct token → Authorization: Bearer header

app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Both authentication methods provide the same JwtPayload structure
  return c.json({
    user: auth.sub,
    email: auth.email,
    source: c.req.header('CF-Access-Jwt-Assertion') ? 'access' : 'api'
  })
})
```

### Limitations

- **Same JWT structure required**: Both authentication methods must use compatible JWT payloads
- **Single issuer**: `JWT_ISS` applies to both Authorization and CF-Access tokens
- **No automatic header selection**: Use header precedence (Authorization first) rather than route-based selection

For separate issuers or different JWT structures, use `authGuardWithConfig()` on different route groups.

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

- extracts JWT from `Authorization: Bearer <jwt>` or `CF-Access-Jwt-Assertion` header
- validates via jwt-kit
- enforces the given policy (if provided)
- injects the verified claims into `c.set('auth', payload)`

**Header Precedence:** `Authorization` is checked first; `CF-Access-Jwt-Assertion` is used as fallback.

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
  .rolesAny('admin', 'analyst') // At least one role required
  .rolesAll('verified', 'approved') // All roles required
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

| Variable                                   | Description                                             |
| ------------------------------------------ | ------------------------------------------------------- |
| `JWT_ISS`, `JWT_AUD`                       | Expected issuer & audience                              |
| `JWT_TTL_SECONDS`, `JWT_LEEWAY`            | Defaults: 900 / 90                                      |
| `JWT_SECRET_NAME` / `JWT_SECRET`           | HS512 secret                                            |
| `JWT_PRIVATE_JWK_NAME` / `JWT_PRIVATE_JWK` | EdDSA signing key (gateway)                             |
| `JWT_JWKS_URL`                             | JWKS endpoint (public URL, use for OIDC/Access)         |
| `JWT_JWKS_URL_NAME`                        | Secret name containing JWKS URL (rarely needed)         |
| `setJwksResolver()`                        | For internal Service Bindings (no public JWKS endpoint) |

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

- Run integration tests in Miniflare with `JWT_SECRET` or a stubbed resolver
- Use `@chrislyons-dev/flarelette-jwt` CLI to generate 64-byte secrets for HS512
- Mock the JWKS resolver in local tests:

  ```typescript
  import { setJwksResolver } from '@chrislyons-dev/flarelette-jwt'

  setJwksResolver(async () => ({ keys: [mockPublicJwk] }))
  ```

---

## Roadmap

- [ ] Optional mTLS / Access integration for external JWKS
- [ ] KV-backed replay store (`jti`)
- [ ] Rich error handling hooks (`onUnauthorized`, `onForbidden`)
- [ ] OpenAPI/Swagger integration

---

## Security First

JWT authentication and input validation are critical security boundaries. This library prioritizes security over convenience:

### Security Requirements (v1.13+)

#### HS512 Secret Minimum Length ⚠️

**CRITICAL:** As of flarelette-jwt v1.13, HS512 secrets must be **at minimum 64 bytes** (512 bits). Shorter secrets will cause configuration errors at startup.

**Generate secure secrets:**
```bash
# Required: 64-byte minimum for HS512
npx flarelette-jwt-secret --len=64
```

**Why 64 bytes?**
- Matches SHA-512 digest size (512 bits)
- Prevents brute-force attacks on weak secrets
- Industry best practice for HMAC-SHA-512
- **Breaking change from v1.12 and earlier**

**Error if secret too short:**
```
Error: JWT secret too short: 32 bytes, need >= 64 for HS512 (use 'npx flarelette-jwt-secret --len=64')
```

#### Mode Exclusivity (Algorithm Confusion Prevention)

**CRITICAL:** You **cannot** configure both HS512 and asymmetric (EdDSA/RSA) modes simultaneously. This prevents algorithm confusion attacks (CVE-2015-9235).

**Choose ONE mode:**
- ✅ **HS512**: `JWT_SECRET_NAME` or `JWT_SECRET`
- ✅ **EdDSA**: `JWT_PRIVATE_JWK_NAME` + `JWT_PUBLIC_JWK_NAME`
- ✅ **RSA (external OIDC)**: `JWT_JWKS_URL`
- ❌ **HS512 + EdDSA**: Configuration error

**Error if both configured:**
```
Configuration error: Both HS512 (JWT_SECRET) and asymmetric (JWT_PUBLIC_JWK/JWT_JWKS_*) secrets configured. Choose one to prevent algorithm confusion attacks.
```

### Authentication Security

- **Fail securely**: Invalid tokens return `401`, insufficient permissions return `403`
- **No detail leakage**: Error messages never expose token structure or validation details
- **Short-lived tokens**: 5-15 minute TTL recommended
- **Audience validation**: Prevents token reuse across services
- **Algorithm whitelisting**: HS512 mode only allows `['HS512']`, EdDSA/RSA mode only allows `['EdDSA', 'RS256', 'RS384', 'RS512']`
- **No `alg: none`**: The `none` algorithm is never supported (CVE-2015-2951)
- **JWKS injection prevention**: JWKS URLs pinned in config, never read from token headers

### Input Validation Security

- **Validate all input**: Every endpoint that accepts data must validate it
- **Use Zod**: Type-safe runtime validation prevents injection attacks and type confusion
- **Constrain everything**: String lengths, array sizes, numeric ranges, formats
- **Never trust input**: Even from authenticated users

### Type Safety

- **100% strict TypeScript**: No `any` types throughout the codebase
- **Runtime + compile-time validation**: Zod provides both type inference and runtime checks
- **Strong typing prevents vulnerabilities**: Type confusion and injection attacks are mitigated

See [JWT Integration Guide](docs/design/jwt-integration.md) for detailed security considerations and the [flarelette-jwt Security Guide](https://github.com/chrislyons-dev/flarelette-jwt-kit/blob/main/docs/security-guide.md) for complete cryptographic details.

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
