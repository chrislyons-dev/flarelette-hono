# Flarelette-Hono Architecture

**Status**: Draft for Review
**Version**: 1.0.0 (Target)
**Date**: 2025-11-01

---

## Executive Summary

Flarelette-Hono is a type-safe, security-first authentication and authorization layer for [Hono](https://hono.dev) on Cloudflare Workers. This document describes the architecture, integration patterns, and design decisions.

**Key Features:**

- Thin adapter layer over `@chrislyons-dev/flarelette-jwt`
- Type-safe middleware and policy builders (no `any` types)
- RFC 8693 token exchange pattern support
- EdDSA (Ed25519) and HS512 algorithms
- JWKS resolution via service bindings

---

## Design Principles

### 1. Security First

- JWT authentication is a critical security boundary
- Fail securely (explicit validation, safe defaults)
- Never trust unverified data
- Type safety prevents common vulnerabilities
- No detail leakage in error messages

### 2. Type Safety

- 100% TypeScript with strict mode enabled
- Never use `any` — use `unknown` when type is truly unknown
- Protocol-based abstractions with explicit interfaces
- Generic types with proper constraints
- Discriminated unions for error handling

### 3. Framework Integration

- Leverage Hono's context system
- Use Hono's middleware pattern
- Type-safe context accessors (`c.get('auth')`)
- Compatible with Hono's ecosystem

### 4. Developer Experience

- Fluent policy builder API
- Clear error messages
- Minimal boilerplate
- Comprehensive type hints
- Self-documenting code

### 5. Standards Aligned

- RFC 7519 (JWT)
- RFC 8693 (OAuth 2.0 Token Exchange)
- RFC 7517 (JSON Web Key - JWK)
- OIDC claims support

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Workers Runtime                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Hono Application     │
                    │   (user's Worker)      │
                    └────────────────────────┘
                                 │
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
          ┌────────────┐  ┌──────────┐  ┌──────────┐
          │ Middleware │  │  Router  │  │ Context  │
          │   (Hono)   │  │ (Hono)   │  │  (Hono)  │
          └────────────┘  └──────────┘  └──────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   ┌─────────┐ ┌──────┐ ┌────────┐
   │authGuard│ │policy│ │ Auth   │
   │         │ │      │ │Context │
   └─────────┘ └──────┘ └────────┘
        │            flarelette-hono
        │            (this package)
        ▼
┌──────────────────────┐
│  @chrislyons-dev/    │
│   flarelette-jwt     │
│                      │
│  • Token creation    │
│  • Verification      │
│  • JWKS resolution   │
│  • EdDSA/HS512       │
└──────────────────────┘
        │
        │ calls
        ▼
┌──────────────────────┐
│  Service Bindings    │
│  (JWKS, Gateway)     │
└──────────────────────┘
```

---

## Core Components

### 1. Authentication Middleware (`authGuard`)

**Responsibilities:**

- Extract `Authorization: Bearer <jwt>` header
- Delegate verification to `@chrislyons-dev/flarelette-jwt`
- Enforce policy (if provided)
- Inject verified claims into Hono context
- Return 401/403 on failure

**Type Signature:**

```typescript
function authGuard(policy?: Policy): MiddlewareHandler<HonoEnv>
```

**Design Notes:**

- Middleware executes before route handler
- Fails fast on invalid tokens
- Generic `HonoEnv` extends Hono's base environment with `auth` variable

### 2. Policy Builder (`policy()`)

**Responsibilities:**

- Fluent API for defining authorization rules
- Type-safe method chaining
- Immutable policy objects
- Compile-time validation

**Type Signature:**

```typescript
interface PolicyBuilder {
  rolesAny(...roles: string[]): PolicyBuilder
  rolesAll(...roles: string[]): PolicyBuilder
  needAny(...permissions: string[]): PolicyBuilder
  needAll(...permissions: string[]): PolicyBuilder
  build(): Policy
}

function policy(): PolicyBuilder
```

**Example:**

```typescript
const adminPolicy = policy()
  .rolesAny('admin', 'superuser')
  .needAll('write:config', 'audit:log')
  .build()
```

**Design Notes:**

- Immutable builder pattern
- Each method returns new builder instance
- `build()` returns frozen policy object
- Policies are JSON-serializable

### 3. JWT Payload Context

**Responsibilities:**

- Type-safe access to verified JWT claims
- RFC 8693 actor claim extraction
- Hono context integration

**Type Definition:**
Uses `JwtPayload` and `ActorClaim` from `@chrislyons-dev/flarelette-jwt`:

```typescript
import type { JwtPayload, ActorClaim } from '@chrislyons-dev/flarelette-jwt'

// JwtPayload includes all standard JWT claims, OIDC claims, and custom claims
// See flarelette-jwt-kit/packages/flarelette-jwt-ts/src/types.ts for full definition
```

**Usage:**

```typescript
app.get('/data', authGuard(), async (c) => {
  const auth: JwtPayload = c.get('auth')

  console.log(auth.sub)            // User subject
  console.log(auth.roles)          // Roles array
  console.log(auth.actor?.org)     // Organization ID
})
```

### 4. Hono Environment Extension

**Responsibilities:**

- Extend Hono's base environment
- Type-safe context accessors
- Cloudflare bindings integration

**Type Definition:**

```typescript
interface HonoEnv {
  Bindings: CloudflareBindings
  Variables: {
    auth: JwtPayload
  }
}

interface CloudflareBindings {
  JWT_SECRET?: string
  JWT_PRIVATE_JWK?: string
  JWT_PUBLIC_JWK?: string
  JWT_JWKS_URL?: string
  [binding: string]: string | Fetcher | undefined
}
```

**Usage:**

```typescript
import { Hono } from 'hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

app.get('/protected', authGuard(), async (c) => {
  // Type-safe access to auth context
  const auth = c.get('auth')  // JwtPayload

  // Type-safe access to bindings
  const secret = c.env.JWT_SECRET  // string | undefined

  return c.json({ user: auth.sub })
})
```

---

## JWT Integration Architecture

### Token Flow (RFC 8693 Pattern)

```
External Client
    │
    │ (Bearer <Auth0 token>)
    ▼
┌─────────────────────┐
│   Gateway Worker    │
│                     │
│ 1. Verify external  │
│ 2. Token exchange   │
│ 3. Mint internal    │
└─────────────────────┘
    │
    │ (Bearer <internal JWT>)
    │ Service Binding
    ▼
┌─────────────────────┐
│  Service Worker     │
│  (using flarelette) │
│                     │
│ 1. authGuard()      │
│ 2. Extract actor    │
│ 3. Check policy     │
│ 4. Business logic   │
└─────────────────────┘
```

### Internal Token Structure

**Claims:**

```json
{
  "iss": "https://gateway.internal",
  "aud": "bond-math.api",
  "sub": "user:12345",
  "org_id": "org123",
  "roles": ["analyst"],
  "permissions": ["read:public", "valuation:write"],
  "cid": "req-9b2...",
  "iat": 1730440000,
  "exp": 1730440900,
  "act": {
    "iss": "https://gateway.internal",
    "sub": "service:gateway"
  }
}
```

**Token Properties:**

- **Algorithm**: EdDSA (Ed25519) preferred, HS512 fallback
- **TTL**: 5-15 minutes (default: 15m)
- **Leeway**: 90 seconds (clock skew tolerance)
- **Audience**: Mesh-wide or service-specific
- **Issuer**: Gateway (`https://gateway.internal`)
- **Actor**: RFC 8693 actor claim identifying the service acting on behalf of the user

### Configuration Model

**Environment Variables:**

**Gateway (Token Producer):**

```bash
# EdDSA Configuration (preferred)
JWT_PRIVATE_JWK_NAME=GATEWAY_PRIVATE_KEY  # Secret binding name
JWT_KID=gateway-key-2025-11               # Key ID
JWT_ALG=EdDSA                             # Auto-detected

# OR HS512 Configuration (fallback)
JWT_SECRET_NAME=GATEWAY_JWT_SECRET        # Secret binding name
JWT_ALG=HS512                             # Auto-detected

# Common Configuration
JWT_ISS=https://gateway.internal          # Issuer
JWT_AUD=bond-math.api                     # Audience (mesh or service)
JWT_TTL_SECONDS=900                       # 15 minutes
```

**Service (Token Consumer):**

```bash
# EdDSA Configuration (preferred)
JWT_JWKS_SERVICE_NAME=GATEWAY_BINDING     # Service binding for JWKS
# OR
JWT_PUBLIC_JWK_NAME=GATEWAY_PUBLIC_KEY    # Public key binding
# OR
JWT_ALLOWED_THUMBPRINTS=abc123,def456     # Key pinning (optional)

# OR HS512 Configuration (fallback)
JWT_SECRET_NAME=INTERNAL_JWT_SECRET       # Secret binding name

# Common Configuration
JWT_ISS=https://gateway.internal          # Expected issuer
JWT_AUD=bond-math.api                     # Expected audience
JWT_LEEWAY_SECONDS=90                     # Clock skew tolerance
```

**Configuration Detection:**

- Algorithm auto-detected from environment variables
- No explicit `JWT_ALG` needed (but supported for override)
- Service binding preferred over inline keys
- Inline keys preferred over HTTP JWKS URLs

### JWKS Resolution Strategy

**Priority Order:**

1. **Service Binding** (preferred): `env.GATEWAY.fetch('/.well-known/jwks.json')`
2. **Inline Public Key**: `JWT_PUBLIC_JWK` environment variable
3. **HTTP JWKS URL**: `JWT_JWKS_URL` with caching

**Caching:**

- 5-minute cooldown between JWKS fetches
- In-memory cache (per Worker instance)
- Automatic refresh on key-not-found

**Security:**

- Thumbprint pinning optional via `JWT_ALLOWED_THUMBPRINTS`
- `kid` header required for JWKS verification
- Key rotation via dual-key JWKS (grace period)

---

## Type System Design

### Strict TypeScript Configuration

**tsconfig.json requirements:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Safety Patterns

**1. Never Use `any`**

```typescript
// ❌ Bad
function processToken(token: any): any {
  return JSON.parse(token)
}

// ✅ Good
function processToken(token: string): JwtPayload {
  if (typeof token !== 'string') {
    throw new TypeError('Token must be string')
  }

  const parsed: JwtPayload = JSON.parse(token)

  // Type narrowing with validation
  if (!isValidJwtPayload(parsed)) {
    throw new TypeError('Invalid token structure')
  }

  return parsed
}

function isValidJwtPayload(value: JwtPayload): value is JwtPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'iss' in value &&
    typeof value.iss === 'string' &&
    'sub' in value &&
    typeof value.sub === 'string'
    // ... additional checks
  )
}
```

**2. Discriminated Unions for Errors**

```typescript
type VerificationResult =
  | { success: true; payload: JwtPayload }
  | { success: false; error: 'invalid_token' | 'expired' | 'wrong_audience' }

async function verifyToken(token: string): Promise<VerificationResult> {
  try {
    const payload = await jwtVerify(token)
    return { success: true, payload }
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return { success: false, error: 'expired' }
    }
    return { success: false, error: 'invalid_token' }
  }
}

// Usage with type narrowing
const result = await verifyToken(token)
if (result.success) {
  console.log(result.payload.sub)  // Type-safe
} else {
  console.error(result.error)      // Type-safe
}
```

**3. Generic Constraints**

```typescript
// Policy builder with proper generic constraints
interface PolicyBuilder<TRoles extends string[] = string[], TPerms extends string[] = string[]> {
  rolesAny<R extends string[]>(...roles: R): PolicyBuilder<R, TPerms>
  needAll<P extends string[]>(...permissions: P): PolicyBuilder<TRoles, P>
  build(): Policy<TRoles[number], TPerms[number]>
}

// Compile-time validation
const policy = policy()
  .rolesAny('admin', 'user')
  .needAll('read:data', 'write:data')
  .build()

// Type: Policy<'admin' | 'user', 'read:data' | 'write:data'>
```

**4. Branded Types for Security**

```typescript
// Prevent mixing verified and unverified tokens
type UnverifiedToken = string & { readonly __brand: 'unverified' }
type VerifiedToken = string & { readonly __brand: 'verified' }

function extractToken(header: string): UnverifiedToken {
  return header.replace('Bearer ', '') as UnverifiedToken
}

async function verify(token: UnverifiedToken): Promise<VerifiedToken | null> {
  const result = await jwtKit.verify(token)
  return result ? (token as unknown as VerifiedToken) : null
}

// Cannot accidentally pass unverified token where verified is expected
function processVerified(token: VerifiedToken): void {
  // Implementation
}

const unverified = extractToken(authHeader)
processVerified(unverified)  // ❌ Type error!

const verified = await verify(unverified)
if (verified) {
  processVerified(verified)  // ✅ OK
}
```

---

## Error Handling Strategy

### Philosophy: Fail Fast for Configuration, Fail Silent for Verification

**Pattern**: Return `null` or discriminated unions for verification failures.

**Rationale:**

- Simpler middleware code
- Consistent with security best practices
- Natural 401/403 responses
- Easier testing

**Implementation:**

```typescript
// Configuration errors throw immediately
function validateConfig(env: CloudflareBindings): JWTConfig {
  if (!env.JWT_ISS) {
    throw new Error('JWT_ISS is required')
  }
  if (!env.JWT_AUD) {
    throw new Error('JWT_AUD is required')
  }

  return {
    iss: env.JWT_ISS,
    aud: env.JWT_AUD,
    // ...
  }
}

// Verification returns null on failure
async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    return await jwtKit.verify(token)
  } catch {
    return null  // All errors collapse to null
  }
}

// Middleware uses null check
const authGuard = (): MiddlewareHandler => {
  return async (c, next) => {
    const token = extractToken(c.req.header('authorization'))
    if (!token) {
      return c.json({ error: 'unauthorized' }, 401)
    }

    const payload = await verifyToken(token)
    if (payload === null) {
      return c.json({ error: 'unauthorized' }, 401)
    }

    c.set('auth', payload)
    return next()
  }
}
```

### Error Types

**Configuration Errors (Fail Fast):**

- Missing required environment variables → `Error`
- Invalid key format → `Error`
- Secret too short → `Error`

**Verification Errors (Fail Silent):**

- Invalid signature → `null`
- Expired token → `null`
- Wrong audience → `null`
- Missing claims → `null`

**Authorization Errors (HTTP Responses):**

- Missing token → 401 Unauthorized
- Invalid token → 401 Unauthorized
- Valid token, insufficient permissions → 403 Forbidden

### HTTP Error Responses

**Standard Format:**

```json
{
  "error": "unauthorized",
  "message": "Invalid or expired token"
}
```

**Status Codes:**

- `401 Unauthorized`: Missing/invalid authentication
- `403 Forbidden`: Valid authentication, insufficient authorization
- `500 Internal Server Error`: Unhandled exception

**Security Notes:**

- Never leak token details in error messages
- Use generic "Invalid or expired token" for all verification failures
- Don't distinguish between "invalid" and "expired" to prevent timing attacks

---

## Middleware Chain Pattern

### Execution Order

```
Request
  │
  ▼
┌─────────────────────────────────────┐
│ authGuard() (if applied)            │
│   ┌─────────────────────────────┐   │
│   │ Policy Enforcement          │   │
│   │   ┌─────────────────────┐   │   │
│   │   │   Route Handler     │   │   │
│   │   └─────────────────────┘   │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
  │
  ▼
Response
```

### Registration Example

```typescript
import { Hono } from 'hono'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Apply auth to specific routes
app.get('/public', (c) => c.json({ public: true }))

app.get('/protected', authGuard(), async (c) => {
  const auth = c.get('auth')
  return c.json({ user: auth.sub })
})

app.get('/admin', authGuard(policy().rolesAny('admin')), async (c) => {
  return c.json({ admin: true })
})

// Apply auth to route group
const api = new Hono<HonoEnv>()
api.use('*', authGuard())  // All /api/* routes require auth

api.get('/data', async (c) => {
  const auth = c.get('auth')
  return c.json({ data: [], user: auth.sub })
})

app.route('/api', api)
```

### Best Practices

1. **Apply authGuard per-route or per-group** as needed
2. **Use type-safe context** with `HonoEnv` generic
3. **Define policies separately** for reuse
4. **Keep policies simple** — combine multiple simple policies rather than one complex one
5. **Log at appropriate level** — debug for detail, info for key events

---

## Testing Strategy

### Test Organization

```
tests/
├── authGuard.test.ts       # Middleware tests
├── policy.test.ts          # Policy builder tests
├── types.test.ts           # Type definition tests
├── integration.test.ts     # End-to-end tests
└── fixtures/
    ├── tokens.ts           # Test tokens
    └── mockEnv.ts          # Mock Cloudflare bindings
```

### Testing Patterns

**Environment Setup:**

```typescript
import { beforeEach } from 'vitest'

beforeEach(() => {
  // Mock Cloudflare bindings
  process.env.JWT_ISS = 'https://test.internal'
  process.env.JWT_AUD = 'test-service'
  process.env.JWT_SECRET = 'a'.repeat(64)
})
```

**Token Creation for Tests:**

```typescript
import { sign } from '@chrislyons-dev/flarelette-jwt'
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'

async function createTestToken(payload: JwtPayload): Promise<string> {
  return sign({
    iss: 'https://test.internal',
    aud: 'test-service',
    ...payload,
  }, { ttlSeconds: 3600 })
}
```

**Negative Testing:**

```typescript
import { describe, it, expect } from 'vitest'

describe('authGuard', () => {
  it('rejects expired token', async () => {
    const token = await createTestToken({ sub: 'user123' }, { ttlSeconds: 1 })
    await new Promise(resolve => setTimeout(resolve, 2000))

    const app = new Hono()
    app.get('/test', authGuard(), (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(401)
  })
})
```

### Coverage Targets

- **Core middleware**: 95%+ line coverage
- **Policy builder**: 100% coverage (critical path)
- **Type definitions**: Compile-time validation
- **Integration tests**: Key workflows end-to-end

---

## Production Readiness Checklist

### Must Have (v1.0.0)

- [ ] `authGuard` middleware with policy support
- [ ] Policy builder (`policy()`)
- [ ] Type-safe context integration
- [ ] EdDSA and HS512 support
- [ ] JWKS resolution via service bindings
- [ ] Comprehensive test suite (95%+ coverage)
- [ ] API documentation
- [ ] Examples

### Should Have (v1.x)

- [ ] Rate limiting middleware
- [ ] Request context/state management
- [ ] Metrics integration (Cloudflare Workers Analytics)
- [ ] Error handling hooks (`onUnauthorized`, `onForbidden`)

### Nice to Have (v2.0)

- [ ] OpenAPI/Swagger integration
- [ ] JWT replay prevention (JTI checking)
- [ ] Multi-tenant support
- [ ] Dynamic policy loading

---

## Security Considerations

### Threat Model Assumptions

**In Scope:**

- Gateway-minted internal tokens
- Service-to-service authentication
- Policy-based authorization
- Token expiration and rotation

**Out of Scope:**

- DDoS protection (handled by Cloudflare)
- Rate limiting per user (application layer)
- External token validation (gateway responsibility)

### Security Properties

1. **Never see external tokens**: Services only validate internal JWTs
2. **Short-lived tokens**: 5-15 minute TTL limits blast radius
3. **Audience validation**: Prevents token reuse across services
4. **Type safety**: Prevents common vulnerabilities
5. **Secure defaults**: Strict validation, safe error handling
6. **No secret leakage**: Errors never expose token details

### Key Rotation Strategy

**Dual-Key JWKS Pattern:**

```json
{
  "keys": [
    {"kid": "gateway-2025-11", "kty": "OKP", "crv": "Ed25519", ...},
    {"kid": "gateway-2025-10", "kty": "OKP", "crv": "Ed25519", ...}
  ]
}
```

**Rotation Steps:**

1. Generate new keypair, add to JWKS with new `kid`
2. Gateway starts signing with new `kid`
3. Services fetch updated JWKS (cache expires)
4. After max TTL (15 minutes), remove old key from JWKS

**Grace Period**: Old key remains in JWKS for one max TTL cycle.

---

## Dependencies

### Runtime Dependencies

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "@chrislyons-dev/flarelette-jwt": "^1.0.0"
  }
}
```

### Development Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@cloudflare/workers-types": "^4.20231218.0",
    "wrangler": "^3.0.0"
  }
}
```

---

## Next Steps

- **Core component implementation**: See [Core Components](#core-components) for `authGuard` and policy builder details
- **API reference**: Read [API Design](./api-design.md) for complete API documentation
- **Configuration setup**: Review [JWT Integration](./jwt-integration.md) for configuration strategies
- **Type system design**: See [Type System Design](#type-system-design) for strict TypeScript patterns
- **Testing strategy**: Review [Testing Strategy](#testing-strategy) for test organization and patterns

---

## References

### Standards

- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 8693 - OAuth 2.0 Token Exchange](https://tools.ietf.org/html/rfc8693)
- [RFC 7517 - JSON Web Key (JWK)](https://tools.ietf.org/html/rfc7517)

### Related Projects

- [Hono](https://hono.dev/) - Ultrafast web framework for the edge
- [@chrislyons-dev/flarelette-jwt](https://www.npmjs.com/package/@chrislyons-dev/flarelette-jwt) - JWT toolkit
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) - Serverless platform

### Documentation

- [API Design Documentation](./api-design.md)
- [JWT Integration Guide](./jwt-integration.md)
