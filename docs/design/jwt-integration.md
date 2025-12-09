# JWT Integration Guide

**Status**: Draft for Review
**Version**: 1.0.0 (Target)
**Date**: 2025-11-01

---

## Overview

Flarelette-Hono integrates with `@chrislyons-dev/flarelette-jwt` to provide JWT authentication for Cloudflare Workers. This document describes the integration architecture, configuration strategies, and usage patterns.

**Separation of Concerns:**

- **@chrislyons-dev/flarelette-jwt**: JWT creation, verification, JWKS resolution (crypto operations)
- **flarelette-hono**: Middleware, policy enforcement, request handling (framework integration)

---

## Token Flow (RFC 8693 Pattern)

### Gateway and Service Mesh Pattern

**CRITICAL:** Both gateway and internal services use `flarelette-hono`. The only difference is the **JWKS resolution strategy**:

- **Gateway**: Uses `JWT_JWKS_URL` (HTTP) to verify external OIDC tokens from Auth0, Okta, Google, Azure AD, or Cloudflare Access
- **Internal Services**: Use `JWT_JWKS_SERVICE_NAME` (service binding) to verify internal tokens from gateway

| Aspect | Gateway Worker | Internal Service |
|--------|----------------|------------------|
| **Middleware** | ✅ `authGuard()` from flarelette-hono | ✅ `authGuard()` from flarelette-hono |
| **JWKS Source** | `JWT_JWKS_URL` (HTTP to OIDC provider) | `JWT_JWKS_SERVICE_NAME` (service binding) |
| **Purpose** | Verify external OIDC, mint internal tokens | Verify internal tokens |
| **Performance** | ~50-100ms (HTTP JWKS fetch + cache) | ~1-5ms (service binding) |

### Gateway-Minted Internal JWTs

Every microservice endpoint requires an **internal JWT** (even "public" ones get an **anonymous** internal token).

```
External Client
    │
    │ (Bearer <Auth0/OIDC token>)
    ▼
┌─────────────────────┐
│   Gateway Worker    │
│  (flarelette-hono)  │
│                     │
│ 1. authGuard()      │ ← Verifies via JWT_JWKS_URL (HTTP)
│ 2. Token exchange   │
│ 3. Mint internal    │
└─────────────────────┘
    │
    │ (Bearer <internal JWT>)
    │ Service Binding
    ▼
┌─────────────────────┐
│  Service Worker     │
│  (flarelette-hono)  │
│                     │
│ 1. authGuard()      │ ← Verifies via JWT_JWKS_SERVICE_NAME (binding)
│ 2. Extract claims   │
│ 3. Check policy     │
│ 4. Business logic   │
└─────────────────────┘
```

### Flow A: Anonymous Request → Internal "anon" Token

```
Client ──(no auth)──▶ Gateway

Gateway → mint internal token:
  sub: "anon:<random>"
  roles: ["anonymous"]
  permissions: ["read:public"]
  iss: "https://gateway.internal"
  aud: <service or mesh audience>
  ttl: 5–15m
  alg: EdDSA (preferred) or HS512

Gateway ──(Authorization: Bearer <internal>)──▶ Service

Service verifies (JWKS/HS), applies policy, returns data
```

### Flow B: Authenticated Request → RFC 8693 Token Exchange → Internal Token

```
Client ──(Authorization: Bearer <user access token>)──▶ Gateway

Gateway (uses flarelette-hono):
  • authGuard() validates external token via JWT_JWKS_URL (Auth0, Okta, etc.)
  • Perform "token exchange" semantics (RFC 8693)
  • Mint internal token with derived claims/permissions

Gateway ──(Authorization: Bearer <internal>)──▶ Service

Service (uses flarelette-hono):
  • authGuard() verifies internal token via JWT_JWKS_SERVICE_NAME (binding)
  • Applies policy, returns data
```

---

## Internal Token Structure

### Claims Model

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

**Standard Claims (RFC 7519):**

- `iss` (Issuer): Gateway URL
- `aud` (Audience): Service or mesh identifier
- `sub` (Subject): User identifier or `anon:<nonce>` for anonymous
- `exp` (Expiration): Unix timestamp
- `iat` (Issued At): Unix timestamp

**Custom Claims:**

- `org_id`: Organization identifier for multi-tenant access control
- `roles`: User role array
- `permissions`: Permission strings array
- `cid` (Correlation ID): Request tracing ID
- `act` (Actor): RFC 8693 actor claim (identifies service acting on behalf of user)

### Actor Claim (RFC 8693)

The `act` claim identifies which service is acting on behalf of the user, enabling delegation tracking and audit trails:

```typescript
import type { ActorClaim } from '@chrislyons-dev/flarelette-jwt'

// ActorClaim structure from flarelette-jwt:
interface ActorClaim {
  iss: string      // Issuer of the acting service
  sub: string      // Service identifier acting on behalf of the user
  act?: ActorClaim // Nested actor for delegation chains (recursive)
}

// User context (roles, permissions, org_id) is stored in the main JWT payload,
// not in the actor claim. The actor identifies the SERVICE, not the user.
```

**TypeScript Access:**

```typescript
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'

app.get('/reports', authGuard(), async (c) => {
  const auth: JwtPayload = c.get('auth')

  // Organization context typically in main payload claims
  // Actor claim identifies the delegating service (RFC 8693)
  const org = auth.org_id || auth.tid  // Use standard OIDC claims

  if (!org) {
    return c.json({ error: 'No organization context' }, 400)
  }

  const reports = await fetchReports({ user: auth.sub, organization: org })

  console.log({
    user: auth.sub,
    actor: auth.actor?.sub,  // Service acting on behalf
    org,
  })

  return c.json({ reports })
})
```

---

## Configuration Strategies

### Overview: Gateway vs Internal Services

| Configuration | Gateway | Internal Services |
|---------------|---------|-------------------|
| **JWKS Source** | `JWT_JWKS_URL` (HTTP to OIDC provider) | `JWT_JWKS_SERVICE_NAME` (service binding) |
| **Issuer** | External OIDC (Auth0, Okta, etc.) | Gateway (`https://gateway.internal`) |
| **Audience** | External app client ID | Internal service ID |
| **Purpose** | Verify external, mint internal | Verify internal |

### Strategy 1: Gateway with HTTP JWKS (External OIDC)

**Best for:** Gateway workers verifying external OIDC tokens

**Benefits:**

- Verify tokens from Auth0, Okta, Google, Azure AD, Cloudflare Access
- Standard OIDC integration
- HTTP JWKS caching (5 minutes)

**Environment Variables:**

```bash
# External OIDC verification
JWT_ISS=https://auth0.example.com/
JWT_AUD=my-app-client-id
JWT_JWKS_URL=https://auth0.example.com/.well-known/jwks.json
JWT_LEEWAY_SECONDS=300

# For minting internal tokens
JWT_PRIVATE_JWK_NAME=GATEWAY_PRIVATE_KEY
JWT_KID=gateway-2025-11
```

**wrangler.toml:**

```toml
name = "jwt-gateway"
main = "src/gateway.ts"
compatibility_date = "2025-10-01"

[vars]
# External OIDC verification (HTTP JWKS)
JWT_ISS = "https://auth0.example.com/"
JWT_AUD = "my-app-client-id"
JWT_JWKS_URL = "https://auth0.example.com/.well-known/jwks.json"
JWT_LEEWAY_SECONDS = "300"

# For minting internal tokens
JWT_PRIVATE_JWK_NAME = "GATEWAY_PRIVATE_KEY"
JWT_KID = "gateway-2025-11"
```

**Gateway Code:**

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import { sign } from '@chrislyons-dev/flarelette-jwt'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Verify external OIDC token via JWT_JWKS_URL, mint internal token
app.post('/token-exchange', authGuard(), async (c) => {
  const externalAuth = c.get('auth')  // Verified via HTTP JWKS

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

### Strategy 2: Internal Services with Service Binding (Recommended)

**Best for:** Production, multi-service mesh, key rotation

**Benefits:**

- Asymmetric verification (no shared secrets)
- Service bindings avoid public HTTP endpoints
- JWKS enables key rotation without service restarts
- Better security properties (Ed25519)

**Environment Variables:**

```bash
JWT_JWKS_SERVICE_NAME=GATEWAY_BINDING
JWT_ISS=https://gateway.internal
JWT_AUD=bond-math.api
JWT_LEEWAY_SECONDS=90
```

**wrangler.toml:**

```toml
name = "bond-math-service"
main = "src/app.ts"
compatibility_date = "2025-10-01"

[[services]]
binding = "GATEWAY"
service = "jwt-gateway"
environment = "production"

[vars]
JWT_JWKS_SERVICE_NAME = "GATEWAY"
JWT_ISS = "https://gateway.internal"
JWT_AUD = "bond-math.api"
```

**Internal Service Code:**

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Verify internal token via service binding
app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')  // Verified via JWT_JWKS_SERVICE_NAME
  return c.json({ data: [], user: auth.sub })
})
```

**Gateway Exposes JWKS:**

```
GET https://gateway.internal/.well-known/jwks.json

{
  "keys": [
    {
      "kid": "gateway-2025-11",
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "base64url_encoded_public_key"
    }
  ]
}
```

**Caching:**

- 5-minute cooldown between JWKS fetches
- Automatic refresh on key-not-found

**Secret Management (Gateway):**

**Critical:** Private keys should be ephemeral and rotated automatically. Never commit keys to version control. This key generation should occur **during automated deployment** (CI/CD pipeline), not manually.

**Example CI/CD workflow (GitHub Actions):**

```yaml
# .github/workflows/deploy.yml
- name: Generate and store EdDSA keypair
  run: |
    # Generate keypair (secret never leaves CI environment)
    openssl genpkey -algorithm ed25519 -outform PEM -out private.pem

    # Store in Cloudflare Workers Secrets via API
    wrangler secret put GATEWAY_PRIVATE_KEY < private.pem

    # Immediately shred (no persistence)
    shred -u private.pem
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**Manual setup (development/testing only):**

```bash
# Generate Ed25519 keypair during deployment
openssl genpkey -algorithm ed25519 -outform PEM -out private.pem
openssl pkey -in private.pem -pubout -outform PEM -out public.pem

# Store in Cloudflare Workers Secrets (no human ever sees this)
wrangler secret put GATEWAY_PRIVATE_KEY < private.pem

# Clean up immediately (never store these)
shred -u private.pem public.pem
```

**Automated Rotation (Every 90 Days):**

```typescript
// Scheduled rotation service
async function rotateGatewayKeypair() {
  // 1. Generate new Ed25519 keypair
  const keypair = crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  )

  // 2. Create new kid
  const kid = `gateway-${new Date().toISOString().substring(0, 7)}`

  // 3. Add to JWKS (both old and new keys present)
  await addKeyToJwks(keypair.publicKey, kid)

  // 4. Update gateway to sign with new kid
  await updateGatewaySigningKey(keypair.privateKey, kid)

  // 5. Wait for max TTL + cache expiry (15m + 5m = 20m)
  await new Promise(resolve => setTimeout(resolve, 20 * 60 * 1000))

  // 6. Remove old key from JWKS
  await removeOldKeyFromJwks()
}
```

### Strategy 3: EdDSA with Inline Public Key

**Best for:** Simple deployments, single gateway, no rotation

**Benefits:**

- Asymmetric verification
- No JWKS fetching overhead
- Simpler configuration

**Limitations:**

- Key rotation requires service redeployment
- No automatic key discovery

**Environment Variables:**

```bash
JWT_PUBLIC_JWK_NAME=GATEWAY_PUBLIC_KEY
JWT_ISS=https://gateway.internal
JWT_AUD=bond-math.api
```

**wrangler.toml:**

```toml
[vars]
JWT_PUBLIC_JWK_NAME = "GATEWAY_PUBLIC_KEY"
JWT_ISS = "https://gateway.internal"
JWT_AUD = "bond-math.api"
```

**Secret (wrangler secret put):**

```bash
# Gateway's Ed25519 public key (JWK format)
echo '{"kty":"OKP","crv":"Ed25519","x":"..."}' | wrangler secret put GATEWAY_PUBLIC_KEY
```

**Rotation:**

- Generate new keypair every 90 days
- Update both gateway (private) and services (public)
- Coordinate deployment (brief downtime acceptable)
- Use Strategy 1 (JWKS) for zero-downtime rotation

### Strategy 4: HS512 with Shared Secret

**Best for:** Development, testing, single-service prototypes

**Benefits:**

- Simple setup (one shared secret)
- Fast verification (<1ms)
- No JWKS fetching

**Limitations:**

- Symmetric key (both sides can mint tokens)
- Secret distribution challenge
- Rotation requires coordination

**Environment Variables:**

```bash
JWT_SECRET_NAME=INTERNAL_JWT_SECRET
JWT_ISS=https://gateway.internal
JWT_AUD=bond-math.api
```

**wrangler.toml:**

```toml
[vars]
JWT_SECRET_NAME = "INTERNAL_JWT_SECRET"
JWT_ISS = "https://gateway.internal"
JWT_AUD = "bond-math.api"
```

**Secret Management:**

**Critical:** Secrets should be ephemeral and generated during automated deployment (CI/CD pipeline). No human should ever see these secrets.

**Generate Cryptographically Secure Secret:**

```bash
# Generate and store 48-byte (384-bit) secret during deployment
# Secret never stored in a variable or file
npx flarelette-jwt-secret --len=64 | wrangler secret put INTERNAL_JWT_SECRET --env production
```

**Automated Rotation (Zero-Downtime):**

```bash
#!/bin/bash
# Rotate HS512 secret every 90 days (automated via CI/CD)

# 1. Generate and store new secret (no human ever sees this)
openssl rand -base64 48 | wrangler secret put INTERNAL_JWT_SECRET_NEW --env production

# 2. Update gateway configuration to sign with new secret
# (Deploy updated wrangler.toml with JWT_SECRET_NAME=INTERNAL_JWT_SECRET_NEW)

# 3. Wait for max TTL (15 minutes) for old tokens to expire
sleep 900

# 4. Remove old secret
wrangler secret delete INTERNAL_JWT_SECRET --env production

# 5. Rename new secret to current
# (Regenerate and store as INTERNAL_JWT_SECRET without intermediate variables)
npx flarelette-jwt-secret --len=64 | wrangler secret put INTERNAL_JWT_SECRET --env production
wrangler secret delete INTERNAL_JWT_SECRET_NEW --env production
```

**Security Warning:**

- ⚠️ **Symmetric keys allow both sides to mint tokens** — Gateway AND services can create valid JWTs
- ⚠️ **Secret distribution is a security risk** — Same secret must be shared with all services
- ⚠️ **Prefer EdDSA (Strategy 1 or 2) for production** — Asymmetric keys prevent services from minting tokens

**When to Use HS512:**

- ✅ Development/testing environments
- ✅ Single-service prototypes
- ✅ High-throughput services where EdDSA verification is a bottleneck (<1ms vs ~5ms)
- ❌ Multi-service production mesh (use EdDSA instead)

---

## Usage Patterns

### Pattern 1: Basic JWT Verification

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'

const app = new Hono<HonoEnv>()

app.get('/data', authGuard(), async (c) => {
  // JWT automatically verified by middleware
  const auth: JwtPayload = c.get('auth')

  return c.json({ data: [], user: auth.sub })
})
```

### Pattern 2: Actor-Based Access Control

```typescript
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'

app.get('/reports', authGuard(), async (c) => {
  const auth: JwtPayload = c.get('auth')

  // Organization context typically in main payload claims
  // Actor claim identifies the delegating service
  const org = auth.org_id || auth.tid  // Use standard OIDC claims

  if (!org) {
    return c.json({ error: 'No organization context' }, 400)
  }

  const reports = await fetchReports({ organization: org })

  console.log({
    user: auth.sub,
    actor: auth.actor?.sub,  // Service acting on behalf
    org,
    count: reports.length,
  })

  return c.json({ reports })
})
```

### Pattern 3: Policy-Based Authorization

```typescript
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'

const valuationPolicy = policy()
  .needAll('valuation:write')

app.post('/valuation/run', authGuard(valuationPolicy), async (c) => {
  // Only accessible if auth has "valuation:write" permission
  const result = await performValuation()
  return c.json({ result })
})
```

### Pattern 4: Role-Based Authorization

```typescript
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'

const adminPolicy = policy()
  .rolesAny('admin', 'superuser')

app.put('/config', authGuard(adminPolicy), async (c) => {
  // Only accessible if auth has "admin" OR "superuser" role
  await updateConfiguration()
  return c.json({ status: 'updated' })
})
```

### Pattern 5: Combined Authorization

```typescript
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'

const sensitivePolicy = policy()
  .rolesAny('admin')
  .needAll('sensitive:write', 'audit:log')

app.post('/sensitive-operation', authGuard(sensitivePolicy), async (c) => {
  // Requires:
  // - Role: "admin"
  // - Permissions: "sensitive:write" AND "audit:log"

  await performSensitiveOperation()
  await logAuditTrail(c.get('auth'))

  return c.json({ status: 'completed' })
})
```

### Pattern 6: Anonymous Endpoints

For public endpoints that don't require authentication, simply don't apply `authGuard`:

```typescript
app.get('/public/health', (c) => c.json({ status: 'healthy' }))

app.get('/public/news', async (c) => {
  const articles = await fetchPublicNews()
  return c.json({ articles })
})
```

**Note:** In the gateway pattern, even "public" routes should receive an anonymous internal JWT with `sub="anon:<nonce>"` and minimal permissions like `["read:public"]`.

---

## Error Handling

### Verification Failures

All JWT verification failures return the same response to prevent information leakage:

**Response (401 Unauthorized):**

```json
{
  "error": "unauthorized",
  "message": "Invalid or expired token"
}
```

**Scenarios:**

- Missing `Authorization` header
- Malformed token
- Invalid signature
- Expired token (`exp` claim)
- Wrong issuer (`iss` claim)
- Wrong audience (`aud` claim)
- Missing required claims

**Security Notes:**

- No distinction between "invalid" and "expired"
- No token structure leaked in error messages
- Generic message prevents timing attacks

### Authorization Failures

**Policy Failure (403 Forbidden):**

```json
{
  "error": "forbidden",
  "message": "Insufficient permissions"
}
```

### Configuration Errors

Configuration errors fail fast at startup:

```typescript
// Missing required environment variable
Error: JWT configuration incomplete: JWT_ISS is required

// Invalid key format
Error: Invalid JWK format in JWT_PUBLIC_JWK_NAME

// Secret too short
Error: JWT secret too short: 16 bytes, need >= 32
```

---

## Testing

### Unit Testing JWT Integration

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import { sign } from '@chrislyons-dev/flarelette-jwt'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'

beforeEach(() => {
  // Configure test environment
  process.env.JWT_ISS = 'https://test.internal'
  process.env.JWT_AUD = 'test-service'
  process.env.JWT_SECRET = 'a'.repeat(64)
})

async function createTestToken(payload: Partial<JwtPayload>): Promise<string> {
  return sign({
    iss: 'https://test.internal',
    aud: 'test-service',
    ...payload,
  }, { ttlSeconds: 3600 })
}

describe('authGuard', () => {
  it('accepts valid token', async () => {
    const app = new Hono<HonoEnv>()
    app.get('/protected', authGuard(), (c) => c.json({ ok: true }))

    const token = await createTestToken({ sub: 'user123' })

    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
  })

  it('rejects missing token', async () => {
    const app = new Hono<HonoEnv>()
    app.get('/protected', authGuard(), (c) => c.json({ ok: true }))

    const res = await app.request('/protected')

    expect(res.status).toBe(401)
  })

  it('rejects expired token', async () => {
    const app = new Hono<HonoEnv>()
    app.get('/protected', authGuard(), (c) => c.json({ ok: true }))

    const token = await createTestToken({ sub: 'user123' }, { ttlSeconds: 1 })
    await new Promise(resolve => setTimeout(resolve, 2000))

    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(401)
  })
})
```

### Integration Testing with Service Bindings

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('JWKS resolution', () => {
  it('fetches JWKS via service binding', async () => {
    // Mock service binding
    const mockBinding = {
      async fetch(url: string) {
        if (url === '/.well-known/jwks.json') {
          return new Response(JSON.stringify({
            keys: [
              {
                kid: 'test-key',
                kty: 'OKP',
                crv: 'Ed25519',
                x: 'base64url_public_key',
              }
            ]
          }), {
            headers: { 'Content-Type': 'application/json' }
          })
        }
        throw new Error('Not found')
      }
    }

    // Configure with mock binding
    process.env.JWT_JWKS_SERVICE_NAME = 'GATEWAY_BINDING'

    // Test JWT verification
    // ... (implementation depends on jwt-kit's test utilities)
  })
})
```

---

## Security Considerations

### Token Handling Best Practices

1. **Never log tokens**

   ```typescript
   // ❌ Bad
   console.log({ token: authHeader })

   // ✅ Good
   console.log({ tokenPrefix: authHeader?.substring(0, 20) + '...' })
   ```

2. **Use EdDSA when possible**

   - Better security properties than HMAC
   - Prevents token minting by services
   - Smaller signature size

3. **Keep TTL short**

   - 5-15 minutes maximum
   - Limits blast radius of compromised tokens
   - Forces frequent gateway interaction

4. **Validate audience**

   - Prevents token reuse across services
   - Gateway should mint service-specific tokens

5. **Use service bindings**
   - Avoids public HTTP endpoints for JWKS
   - Better performance (direct Worker RPC)
   - Integrated with Cloudflare routing

### Key Rotation Strategy

**Dual-Key JWKS Pattern (Zero-Downtime Rotation):**

1. **Generate new keypair**
2. **Add to JWKS** (both keys present)
3. **Gateway starts signing with new key**
4. **Wait for max TTL (15 minutes)**
5. **Remove old key from JWKS**

**Rotation Frequency:**

- Regular rotation: Every 90 days
- Emergency rotation: Immediately if compromise suspected

### Threat Model

**Assumptions:**

- Gateway is trusted (mints internal tokens)
- Service bindings are secure (Cloudflare internal routing)
- Secrets are managed securely (Cloudflare Secrets)

**In Scope:**

- Token verification (signature, expiration, audience)
- Policy-based authorization
- Actor claim validation

**Out of Scope:**

- External token validation (gateway responsibility)
- Rate limiting (application layer)
- DDoS protection (Cloudflare infrastructure)

**Mitigations:**

- Short TTL limits token lifetime
- Audience validation prevents cross-service reuse
- JWKS caching limits thundering herd
- Fail-silent verification prevents information leakage

---

## Troubleshooting

### Common Issues

**Issue: "Invalid or expired token" errors**

**Possible Causes:**

1. Clock skew between gateway and service
2. Token expired (check TTL)
3. Wrong audience configuration
4. JWKS cache stale (key rotation)

**Solutions:**

1. Increase `JWT_LEEWAY_SECONDS` (default: 90)
2. Check gateway TTL configuration
3. Verify `JWT_AUD` matches gateway-minted audience
4. Wait 5 minutes for JWKS cache to expire

**Issue: "JWT configuration incomplete" error**

**Possible Causes:**

1. Missing environment variables
2. Secret binding not configured in wrangler.toml
3. Wrong secret name

**Solutions:**

1. Check all required env vars are set:
   - `JWT_ISS`
   - `JWT_AUD`
   - `JWT_SECRET_NAME` or `JWT_JWKS_SERVICE_NAME`
2. Verify wrangler.toml has service binding or secret
3. Ensure secret names match exactly

**Issue: JWKS fetch failures**

**Possible Causes:**

1. Service binding not configured
2. Gateway not exposing `/.well-known/jwks.json`
3. Network issues

**Solutions:**

1. Verify service binding in wrangler.toml
2. Test JWKS endpoint manually
3. Check Cloudflare Workers logs

**Issue: "Insufficient permissions" despite correct permissions**

**Possible Causes:**

1. Token has wrong permission structure
2. Gateway not minting correct permissions
3. Case-sensitive permission mismatch

**Solutions:**

1. Log `auth.permissions` to verify permissions
2. Check gateway permission mapping logic
3. Ensure exact string matches (case-sensitive)

### Debugging

**Enable Debug Logging:**

```typescript
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'

// Log auth context for debugging
app.get('/debug', authGuard(), async (c) => {
  const auth: JwtPayload = c.get('auth')

  return c.json({
    auth: {
      sub: auth.sub,
      permissions: auth.permissions,
      roles: auth.roles,
      actor: auth.actor,
    },
  })
})
```

**Test Token Verification Manually:**

```typescript
import { verify } from '@chrislyons-dev/flarelette-jwt'

const token = 'eyJhbGciOiJFZERTQSIs...'

const payload = await verify(token, {
  issuer: 'https://gateway.internal',
  audience: 'bond-math.api',
})

if (payload === null) {
  console.log('Verification failed')
} else {
  console.log('Verified:', payload)
}
```

---

## Next Steps

- **Quick implementation**: Start with [Strategy 3 (HS512)](#strategy-3-hs512-with-shared-secret) for development
- **Production deployment**: Upgrade to [Strategy 1 (EdDSA with Service Binding)](#strategy-1-eddsa-with-service-binding-recommended)
- **Usage patterns**: See [Usage Patterns](#usage-patterns) for authentication and authorization examples
- **API reference**: Read [API Design](./api-design.md) for complete middleware documentation
- **Architecture details**: Review [Architecture](./architecture.md) for system design overview

---

## References

### Standards

- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 8693 - OAuth 2.0 Token Exchange](https://tools.ietf.org/html/rfc8693)
- [RFC 7517 - JSON Web Key (JWK)](https://tools.ietf.org/html/rfc7517)

### External Documentation

- [@chrislyons-dev/flarelette-jwt](https://www.npmjs.com/package/@chrislyons-dev/flarelette-jwt)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)

### Related Documentation

- [Architecture Documentation](./architecture.md)
- [API Design Documentation](./api-design.md)
