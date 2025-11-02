# Flarelette-Hono API Design

**Status**: Draft for Review
**Version**: 1.0.0 (Target)
**Date**: 2025-11-01

---

## Design Philosophy

### Security First

JWT authentication is a **critical security boundary**. Every API decision prioritizes security over convenience.

### Type Safety

100% TypeScript coverage with strict mode. Never use `any` — use proper types from `@chrislyons-dev/flarelette-jwt` for JWT payloads.

### Clear & Explicit

Function signatures make security implications obvious. No hidden behavior, no magic defaults.

### Standards Aligned

- RFC 7519 (JWT structure and claims)
- RFC 8693 (OAuth 2.0 Token Exchange for actor claims)
- OIDC claims support (`sub`, `iss`, `aud`, etc.)

---

## Core API

### Authentication Middleware

```typescript
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()
```

#### `authGuard(policy?: Policy)`

Hono middleware for JWT verification and policy enforcement.

**Type Signature:**

```typescript
function authGuard(policy?: Policy): MiddlewareHandler<HonoEnv>
```

**Parameters:**

- `policy` (optional): Policy object created by `policy()` builder

**Behavior:**

1. Extract `Bearer` token from `Authorization` header
2. Verify token using `@chrislyons-dev/flarelette-jwt`
3. If valid and policy passes: store claims in `c.set('auth', payload)`, call next handler
4. If invalid/missing: return 401 Unauthorized
5. If policy fails: return 403 Forbidden

**Error Responses:**

- Missing `Authorization` header → 401
- Invalid/malformed token → 401
- Expired token → 401
- Wrong audience → 401
- Signature verification failure → 401
- Policy check failure → 403

**Security Notes:**

- Error messages are generic: `"Invalid or expired token"`
- No detail leakage (prevents timing attacks)
- Uses constant-time comparison for secrets (in jwt-kit)

**Examples:**

```typescript
// Require authentication only
app.get('/protected', authGuard(), async (c) => {
  const auth = c.get('auth') // JwtPayload
  return c.json({ user: auth.sub })
})

// Require authentication + specific policy
const adminPolicy = policy().rolesAny('admin')
app.get('/admin', authGuard(adminPolicy), async (c) => {
  return c.json({ admin: true })
})

// Apply to route group
const api = new Hono<HonoEnv>()
api.use('*', authGuard()) // All /api/* routes protected

api.get('/data', async (c) => {
  const auth = c.get('auth')
  return c.json({ data: [], user: auth.sub })
})

app.route('/api', api)
```

---

### Policy Builder

```typescript
import { policy } from '@chrislyons-dev/flarelette-hono'
```

#### `policy()`

Fluent builder for creating authorization policies.

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

**Methods:**

##### `rolesAny(...roles: string[])`

Require at least one of the specified roles.

```typescript
const policy = policy().rolesAny('admin', 'analyst').build()

// Passes if auth.roles includes 'admin' OR 'analyst'
```

##### `rolesAll(...roles: string[])`

Require all specified roles.

```typescript
const policy = policy().rolesAll('verified', 'approved').build()

// Passes only if auth.roles includes BOTH 'verified' AND 'approved'
```

##### `needAny(...permissions: string[])`

Require at least one of the specified permissions.

```typescript
const policy = policy().needAny('read:data', 'read:reports').build()

// Passes if auth.permissions includes 'read:data' OR 'read:reports'
```

##### `needAll(...permissions: string[])`

Require all specified permissions.

```typescript
const policy = policy().needAll('write:reports', 'audit:log').build()

// Passes only if auth.permissions includes BOTH 'write:reports' AND 'audit:log'
```

##### `build()`

Finalize and return immutable policy object.

**Notes:**

- All methods return new `PolicyBuilder` instance (immutable)
- Methods can be chained in any order
- `build()` returns frozen policy object
- Empty policy (no rules) = allow all authenticated users

**Complete Examples:**

```typescript
// Simple role check
const analystPolicy = policy().rolesAny('analyst', 'admin')

// Simple permission check
const readPolicy = policy().needAll('read:reports')

// Combined role + permission
const adminWritePolicy = policy().rolesAny('admin').needAll('write:config', 'audit:log')

// Complex policy
const complexPolicy = policy()
  .rolesAny('admin', 'superuser') // Must have one of these roles
  .rolesAll('verified') // AND must have verified role
  .needAny('read:data', 'read:reports') // AND must have at least one read permission
  .needAll('audit:access') // AND must have audit permission
```

**Policy Evaluation:**

All conditions are combined with AND logic at the top level:

- `rolesAny` rules are OR'd together
- `rolesAll` rules are AND'd together
- `needAny` rules are OR'd together
- `needAll` rules are AND'd together
- Then all groups are AND'd together

```typescript
// Example: This policy requires:
// (role=admin OR role=analyst) AND (perm=read:data OR perm=read:reports)
const policy = policy().rolesAny('admin', 'analyst').needAny('read:data', 'read:reports')
```

---

### JWT Payload Context

#### `JwtPayload`

Verified JWT payload injected into Hono context.

Uses `JwtPayload` from `@chrislyons-dev/flarelette-jwt`:

**Type Definition:**

```typescript
import type { JwtPayload, ActorClaim } from '@chrislyons-dev/flarelette-jwt'

// JwtPayload includes:
// - Standard JWT claims (iss, sub, aud, exp, iat, nbf, jti)
// - OIDC claims (name, email, email_verified, client_id, etc.)
// - Authorization claims (permissions, roles, groups, etc.)
// - Delegation claims (act: ActorClaim)
// - Additional custom claims
// See flarelette-jwt-kit/packages/flarelette-jwt-ts/src/types.ts for full definition
```

**Standard Claims (RFC 7519):**

- `iss` (Issuer): Gateway URL (`https://gateway.internal`)
- `aud` (Audience): Service or mesh identifier (`bond-math.api`)
- `sub` (Subject): User identifier (`user:12345` or `anon:<nonce>`)
- `exp` (Expiration): Unix timestamp
- `iat` (Issued At): Unix timestamp

**Custom Claims:**

- `roles`: User role array (e.g., `['analyst', 'verified']`)
- `permissions` or `scp`: Permissions array (e.g., `['read:reports', 'write:data']`)
- `actor`: RFC 8693 actor claim (identifies service acting on behalf of user)

**Usage:**

```typescript
app.get('/data', authGuard(), async (c) => {
  const auth: JwtPayload = c.get('auth')

  console.log(auth.iss) // 'https://gateway.internal'
  console.log(auth.sub) // 'user:12345'
  console.log(auth.roles) // ['analyst']
  console.log(auth.permissions) // ['read:reports']

  // Check claims manually
  if (auth.roles?.includes('admin')) {
    // Admin-specific logic
  }

  return c.json({ user: auth.sub })
})
```

#### `ActorClaim`

RFC 8693 actor claim identifying the service acting on behalf of the user.

**Type Definition:**
Uses `ActorClaim` from `@chrislyons-dev/flarelette-jwt`:

```typescript
import type { ActorClaim } from '@chrislyons-dev/flarelette-jwt'

// ActorClaim structure:
// - iss: Issuer of the acting service
// - sub: Service identifier acting on behalf of the user
// - act?: Nested actor for delegation chains (recursive)
```

**RFC 8693 Alignment:**

- Maps to `act` claim in internal JWT
- Identifies which service is acting on behalf of the user (delegation)
- Enables audit trails showing which services handled the request
- Supports recursive delegation chains for multi-hop scenarios

**Usage:**

```typescript
app.get('/reports', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Organization context typically in main payload claims (not actor)
  // Actor claim identifies the delegating service (RFC 8693)
  const org = auth.org_id || auth.tid // Use standard OIDC claims

  if (!org) {
    return c.json({ error: 'No organization context' }, 400)
  }

  // Filter data by organization
  const reports = await fetchReports({ organization: org })

  console.log({
    user: auth.sub,
    actor: auth.actor?.sub, // Service acting on behalf
    org,
  })

  return c.json({ reports })
})
```

---

### Hono Environment Extension

#### `HonoEnv`

Extended Hono environment with authentication context.

**Type Definition:**

```typescript
interface HonoEnv {
  Bindings: CloudflareBindings
  Variables: {
    auth: JwtPayload
  }
}

interface CloudflareBindings {
  // JWT Configuration (optional, from environment variables)
  JWT_ISS?: string
  JWT_AUD?: string
  JWT_SECRET?: string
  JWT_SECRET_NAME?: string
  JWT_PRIVATE_JWK?: string
  JWT_PRIVATE_JWK_NAME?: string
  JWT_PUBLIC_JWK?: string
  JWT_PUBLIC_JWK_NAME?: string
  JWT_JWKS_URL?: string
  JWT_JWKS_URL_NAME?: string
  JWT_TTL_SECONDS?: string
  JWT_LEEWAY_SECONDS?: string

  // Service Bindings
  [binding: string]: string | Fetcher | undefined
}
```

**Usage:**

```typescript
import { Hono } from 'hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

// Apply HonoEnv to your app
const app = new Hono<HonoEnv>()

app.get('/protected', authGuard(), async (c) => {
  // Type-safe access to auth context
  const auth = c.get('auth') // JwtPayload (not undefined)

  // Type-safe access to bindings
  const issuer = c.env.JWT_ISS // string | undefined

  return c.json({ user: auth.sub })
})
```

**Extending HonoEnv:**

If you have additional bindings or variables:

```typescript
import type { HonoEnv as BaseHonoEnv } from '@chrislyons-dev/flarelette-hono'

interface MyEnv extends BaseHonoEnv {
  Bindings: BaseHonoEnv['Bindings'] & {
    DB: D1Database
    KV: KVNamespace
  }
  Variables: BaseHonoEnv['Variables'] & {
    requestId: string
  }
}

const app = new Hono<MyEnv>()

app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  await next()
})

app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth') // JwtPayload
  const requestId = c.get('requestId') // string
  const db = c.env.DB // D1Database

  const results = await db.prepare('SELECT * FROM data').all()
  return c.json({ results, requestId, user: auth.sub })
})
```

---

## Next Steps

- **Complete policy builder reference**: See [Policy Builder section](#policy-builder) for all policy methods
- **JWT payload structure**: See [JWT Payload Context](#jwt-payload-context) for claim details
- **Configuration strategies**: Read [JWT Integration Guide](../design/jwt-integration.md#configuration-strategies) for EdDSA vs HS512
- **Architecture overview**: Review [Architecture](../design/architecture.md) for system design
- **Testing patterns**: See the CONTRIBUTING.md file in the repository root for test examples

---

## Type Definitions

### Core Types

```typescript
// Policy types
interface Policy {
  readonly rolesAny?: ReadonlyArray<string>
  readonly rolesAll?: ReadonlyArray<string>
  readonly needAny?: ReadonlyArray<string>
  readonly needAll?: ReadonlyArray<string>
}

interface PolicyBuilder {
  rolesAny(...roles: string[]): PolicyBuilder
  rolesAll(...roles: string[]): PolicyBuilder
  needAny(...permissions: string[]): PolicyBuilder
  needAll(...permissions: string[]): PolicyBuilder
  build(): Policy
}

// JWT Payload (from @chrislyons-dev/flarelette-jwt)
// Includes standard JWT claims, OIDC claims, authorization claims,
// and RFC 8693 actor claim. See flarelette-jwt-kit types for details.
import type { JwtPayload, ActorClaim } from '@chrislyons-dev/flarelette-jwt'

// Hono environment
interface HonoEnv {
  Bindings: CloudflareBindings
  Variables: {
    auth: JwtPayload
  }
}

interface CloudflareBindings {
  JWT_ISS?: string
  JWT_AUD?: string
  JWT_SECRET?: string
  JWT_SECRET_NAME?: string
  JWT_PRIVATE_JWK?: string
  JWT_PRIVATE_JWK_NAME?: string
  JWT_PUBLIC_JWK?: string
  JWT_PUBLIC_JWK_NAME?: string
  JWT_JWKS_URL?: string
  JWT_JWKS_URL_NAME?: string
  JWT_TTL_SECONDS?: string
  JWT_LEEWAY_SECONDS?: string
  [binding: string]: string | Fetcher | undefined
}
```

### Error Types

```typescript
// HTTP error responses
interface ErrorResponse {
  error: string
  message: string
}

// Verification result (discriminated union)
type VerificationResult =
  | { success: true; payload: JwtPayload }
  | { success: false; error: VerificationError }

type VerificationError =
  | 'invalid_token'
  | 'expired'
  | 'wrong_audience'
  | 'wrong_issuer'
  | 'missing_claims'

// Policy evaluation result
type PolicyResult = { allowed: true } | { allowed: false; reason: string }
```

---

## Examples

### Minimal Service

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Public health check
app.get('/health', (c) => c.json({ ok: true }))

// Protected endpoint
app.get('/protected', authGuard(), async (c) => {
  const auth = c.get('auth')
  return c.json({ message: 'Hello', user: auth.sub })
})

export default app
```

### Authenticated Service with Policies

```typescript
import { Hono } from 'hono'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Define reusable policies
const analystPolicy = policy().rolesAny('analyst', 'admin').needAll('read:reports')

const adminPolicy = policy().rolesAny('admin').needAll('write:config', 'audit:log')

// Public endpoint
app.get('/health', (c) => c.json({ ok: true }))

// Analyst endpoint
app.get('/reports', authGuard(analystPolicy), async (c) => {
  const auth = c.get('auth')
  const reports = await fetchReports(auth.actor?.org)
  return c.json({ reports })
})

// Admin endpoint
app.put('/config', authGuard(adminPolicy), async (c) => {
  const body = await c.req.json()
  await updateConfig(body)
  return c.json({ ok: true })
})

export default app
```

### Organization-Based Access Control

```typescript
import { Hono } from 'hono'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// All authenticated users can read their org's data
app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Organization context in main payload (org_id or tid)
  const org = auth.org_id || auth.tid

  if (!org) {
    return c.json({ error: 'No organization context' }, 400)
  }

  // Filter by organization
  const data = await db.select().from('data').where('organization_id', org)

  return c.json({ data })
})

// Only org admins can create data
const orgAdminPolicy = policy().rolesAny('org_admin', 'admin').needAll('write:data')

app.post('/data', authGuard(orgAdminPolicy), async (c) => {
  const auth = c.get('auth')
  const body = await c.req.json()

  // Organization context in main payload
  const org = auth.org_id || auth.tid

  // Enforce organization boundary
  const data = await db.insert('data', {
    ...body,
    organization_id: org,
    created_by: auth.sub,
  })

  return c.json({ data }, 201)
})

export default app
```

### Service-to-Service Authentication

```typescript
import { Hono } from 'hono'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Internal service endpoint (called by other Workers via Service Binding)
const internalPolicy = policy().rolesAny('service').needAll('valuation:run')

app.post('/internal/valuation', authGuard(internalPolicy), async (c) => {
  const auth = c.get('auth')
  const body = await c.req.json()

  // Log service-to-service call
  console.log({
    caller: auth.sub, // 'service:gateway'
    operation: 'valuation',
    requestId: body.requestId,
  })

  const result = await runValuation(body)

  return c.json({ result })
})

export default app
```

### Dynamic Permission Checking

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Resource-based access control
app.get('/reports/:id', authGuard(), async (c) => {
  const auth = c.get('auth')
  const reportId = c.req.param('id')

  // Fetch report
  const report = await db.reports.findById(reportId)

  if (!report) {
    return c.json({ error: 'Report not found' }, 404)
  }

  // Check if user has permission to access this report
  const canRead =
    auth.permissions?.includes('read:all_reports') ||
    (auth.permissions?.includes('read:own_reports') && report.createdBy === auth.sub) ||
    (auth.actor?.org === report.organizationId && auth.permissions?.includes('read:org_reports'))

  if (!canRead) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json({ report })
})

export default app
```

### Custom Middleware Composition

```typescript
import { Hono } from 'hono'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'
import type { Context, Next } from 'hono'

// Custom middleware that requires auth
const requireOrganization = () => {
  return async (c: Context<HonoEnv>, next: Next) => {
    const auth = c.get('auth') // JwtPayload

    // Organization context in main payload claims
    const org = auth.org_id || auth.tid

    if (!org) {
      return c.json({ error: 'Organization context required' }, 400)
    }

    await next()
  }
}

const app = new Hono<HonoEnv>()

// Chain middleware
app.get('/org-data', authGuard(), requireOrganization(), async (c) => {
  const auth = c.get('auth')
  // Organization is guaranteed to exist here
  const org = auth.org_id || auth.tid
  const data = await fetchOrgData(org!)
  return c.json({ data })
})

export default app
```

---

## Best Practices

### 1. Define Policies as Constants

```typescript
// ✅ Good: Reusable, testable, documented
const ANALYST_POLICY = policy().rolesAny('analyst', 'admin').needAll('read:reports')

const ADMIN_POLICY = policy().rolesAny('admin').needAll('write:config', 'audit:log')

app.get('/reports', authGuard(ANALYST_POLICY), handler)
app.put('/config', authGuard(ADMIN_POLICY), handler)
```

```typescript
// ❌ Bad: Inline, not reusable
app.get(
  '/reports',
  authGuard(policy().rolesAny('analyst', 'admin').needAll('read:reports')),
  handler
)
```

### 2. Use Type-Safe Context Access

```typescript
// ✅ Good: Type-safe with HonoEnv
const app = new Hono<HonoEnv>()

app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth') // Type: JwtPayload
  return c.json({ user: auth.sub })
})
```

```typescript
// ❌ Bad: No type safety
const app = new Hono()

app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth') // Type: unknown
  return c.json({ user: auth.sub }) // Type error!
})
```

### 3. Handle Missing Organization Context

```typescript
// ✅ Good: Explicit check
app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Organization context in main payload claims
  const org = auth.org_id || auth.tid

  if (!org) {
    return c.json({ error: 'Organization context required' }, 400)
  }

  // org is guaranteed to exist
  const data = await fetchData(org)
  return c.json({ data })
})
```

```typescript
// ❌ Bad: Assuming org exists
app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')
  const data = await fetchData(auth.org_id) // Runtime error if org_id is undefined!
  return c.json({ data })
})
```

### 4. Separate Public and Protected Routes

```typescript
// ✅ Good: Clear separation
const app = new Hono<HonoEnv>()

// Public routes
app.get('/health', (c) => c.json({ ok: true }))
app.get('/public/news', publicHandler)

// Protected routes
const api = new Hono<HonoEnv>()
api.use('*', authGuard())

api.get('/data', dataHandler)
api.post('/data', createHandler)

app.route('/api', api)
```

### 5. Log Security Events

```typescript
app.get('/sensitive', authGuard(ADMIN_POLICY), async (c) => {
  const auth = c.get('auth')

  // Log access to sensitive resource
  console.log({
    event: 'sensitive_access',
    user: auth.sub,
    actor: auth.actor?.sub,
    organization: auth.actor?.org,
    timestamp: new Date().toISOString(),
  })

  const data = await fetchSensitiveData()
  return c.json({ data })
})
```

### 6. Never Log Tokens

```typescript
// ❌ Bad: Logging token
app.use('*', async (c, next) => {
  const authHeader = c.req.header('authorization')
  console.log({ authHeader }) // Never log tokens!
  await next()
})
```

```typescript
// ✅ Good: Log token prefix only
app.use('*', async (c, next) => {
  const authHeader = c.req.header('authorization')
  if (authHeader) {
    console.log({ authPrefix: authHeader.substring(0, 20) + '...' })
  }
  await next()
})
```

---

## Performance Notes

### Token Verification

- **EdDSA (Ed25519)**: ~5ms per verification
- **HS512**: ~1ms per verification
- **JWKS fetch**: Cached for 5 minutes

**Recommendation:** Use EdDSA for security, HS512 for high-throughput services.

### Middleware Overhead

- **Per authGuard**: <2ms (includes verification)
- **Per policy check**: <0.1ms

**Recommendation:** Apply authGuard at route group level when possible.

### Bundle Size

- **flarelette-hono**: ~5KB (minified)
- **@chrislyons-dev/flarelette-jwt**: ~15KB (minified)
- **Total overhead**: ~20KB

---

## Security Recommendations

### Token Handling

1. **Never log tokens**: Sensitive data
2. **Use EdDSA when possible**: Better security properties
3. **Keep TTL short**: 5-15 minutes
4. **Validate audience**: Prevent token reuse across services
5. **Use service bindings**: Avoid HTTP JWKS URLs in production

### Error Messages

1. **Generic auth errors**: "Invalid or expired token"
2. **No detail leakage**: Don't expose token structure
3. **Log internally**: Full error details in logs, not responses

### Policy Design

1. **Least privilege**: Narrow permissions per route
2. **Clear naming**: `resource:action` format (e.g., `valuation:write`)
3. **Validate at gateway**: Don't trust incoming permissions
4. **Document policies**: Maintain policy registry

### Type Safety

1. **Never use `any`**: Use `unknown` when type is unclear
2. **Validate external data**: Don't trust c.req.json() output
3. **Use type guards**: Narrow `unknown` to specific types
4. **Enable strict mode**: All TypeScript strict flags

---

## Migration Patterns

### From Manual JWT Verification

**Before:**

```typescript
app.get('/data', async (c) => {
  const authHeader = c.req.header('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.substring(7)
  const payload = await verifyJWT(token)

  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  // Use payload...
})
```

**After:**

```typescript
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')
  // Use auth...
})
```

### From Custom Authorization

**Before:**

```typescript
app.get('/admin', async (c) => {
  const payload = c.get('auth')

  if (!payload.roles?.includes('admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Admin logic...
})
```

**After:**

```typescript
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'

const adminPolicy = policy().rolesAny('admin')

app.get('/admin', authGuard(adminPolicy), async (c) => {
  // Admin logic...
})
```

---

## Troubleshooting

### "Property 'auth' does not exist on type 'Context'"

**Solution:** Add `HonoEnv` generic to your Hono app:

```typescript
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>() // Add generic here

app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth') // Type: JwtPayload
  return c.json({ user: auth.sub })
})
```

**Without HonoEnv (type error):**

```typescript
const app = new Hono() // ❌ No generic

app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth') // Type: unknown
  return c.json({ user: auth.sub }) // ❌ Type error!
})
```

### "401 Unauthorized" on valid token

**Possible causes:**

1. Wrong audience (`JWT_AUD` doesn't match token `aud`)
2. Wrong issuer (`JWT_ISS` doesn't match token `iss`)
3. Clock skew (increase `JWT_LEEWAY_SECONDS`)
4. JWKS cache stale (wait 5 minutes)

**Debug:**

```typescript
console.log({
  envIss: c.env.JWT_ISS,
  envAud: c.env.JWT_AUD,
  tokenHeader: c.req.header('authorization')?.substring(0, 30) + '...',
})
```

### "403 Forbidden" with correct policy

**Possible causes:**

1. Token missing required roles/permissions
2. Case-sensitive mismatch
3. Policy logic error

**Debug:**

```typescript
app.get('/data', authGuard(policy), async (c) => {
  const auth = c.get('auth')
  console.log({
    roles: auth.roles,
    permissions: auth.permissions,
    policy: JSON.stringify(policy),
  })
  // ...
})
```

---

## References

### Standards

- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 8693 - OAuth 2.0 Token Exchange](https://tools.ietf.org/html/rfc8693)

### Related Documentation

- [Architecture Documentation](../design/architecture.md)
- [JWT Integration Guide](../design/jwt-integration.md)

### External Resources

- [Hono Documentation](https://hono.dev)
- [@chrislyons-dev/flarelette-jwt](https://www.npmjs.com/package/@chrislyons-dev/flarelette-jwt)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
