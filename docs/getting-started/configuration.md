# Configuration Examples

Complete wrangler.toml configuration examples for common authentication scenarios.

---

## Security Requirements (v1.13+)

### HS512 Secret Minimum: 64 Bytes ⚠️

**CRITICAL:** As of flarelette-jwt v1.13, HS512 secrets **must be at minimum 64 bytes** (512 bits). Shorter secrets cause startup errors.

```bash
# Generate secure 64-byte secrets
npx flarelette-jwt-secret --len=64
```

**Why?** HS512 uses SHA-512 (512-bit digest). Shorter secrets weaken security below the algorithm's capability.

### Mode Exclusivity (Algorithm Confusion Prevention)

**CRITICAL:** Cannot configure both HS512 and asymmetric modes simultaneously (prevents CVE-2015-9235).

**Choose ONE:**
- ✅ HS512: `JWT_SECRET_NAME` or `JWT_SECRET`
- ✅ EdDSA: `JWT_PRIVATE_JWK_NAME` + `JWT_PUBLIC_JWK_NAME`
- ✅ RSA: `JWT_JWKS_URL` (external OIDC)
- ❌ Both: Configuration error

---

## Table of Contents

- [Cloudflare Access](#cloudflare-access)
- [OIDC Providers](#oidc-providers)
  - [Auth0](#auth0)
  - [Okta](#okta)
  - [Google Workspace](#google-workspace)
  - [Azure AD (Microsoft Entra ID)](#azure-ad-microsoft-entra-id)
  - [Generic OIDC](#generic-oidc)
- [Internal Gateway JWT](#internal-gateway-jwt)
- [Mixed Authentication](#mixed-authentication)

---

## Cloudflare Access

Workers behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) receive authenticated JWTs via the `CF-Access-Jwt-Assertion` header.

**JWKS Compatibility:** Cloudflare Access provides a **standard JWKS format** (RFC 7517) but at a **non-standard path** (`/cdn-cgi/access/certs` instead of `/.well-known/jwks.json`). There is no OIDC discovery endpoint (`/.well-known/openid-configuration`).

### Configuration

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
# Cloudflare Access issuer (your team domain)
JWT_ISS = "https://your-team.cloudflareaccess.com"

# Application Audience Tag (from Access policy settings)
JWT_AUD = "abc123def456ghi789"

# JWKS URL (public endpoint - no need for secret)
JWT_JWKS_URL = "https://your-team.cloudflareaccess.com/cdn-cgi/access/certs"

# Clock skew tolerance (Access tokens can have timing differences)
JWT_LEEWAY_SECONDS = "300"
```

**Note:** JWKS URLs are public endpoints that serve public keys for JWT verification. They don't need to be stored as secrets.

### Finding Your Configuration Values

1. **Team Domain** (`JWT_ISS`):
   - Go to [Zero Trust dashboard](https://one.dash.cloudflare.com/) → Settings → Custom Pages
   - Your team domain is shown at the top: `https://your-team.cloudflareaccess.com`

2. **Application AUD** (`JWT_AUD`):
   - Go to Access → Applications → [Your Application] → Overview
   - Copy the "Application Audience (AUD) Tag"

3. **JWKS URL**:
   - Always: `https://your-team.cloudflareaccess.com/cdn-cgi/access/certs`

### Cloudflare Access vs Standard OIDC

| Aspect | Cloudflare Access | Standard OIDC Provider |
|--------|------------------|------------------------|
| **JWKS Format** | ✅ RFC 7517 compliant | ✅ RFC 7517 compliant |
| **JWKS Path** | `/cdn-cgi/access/certs` (non-standard) | `/.well-known/jwks.json` (standard) |
| **Discovery Endpoint** | ❌ Not available | ✅ `/.well-known/openid-configuration` |
| **Token Header** | `CF-Access-Jwt-Assertion` (custom) | `Authorization: Bearer` (standard) |

**Why this matters:**
- Cloudflare Access acts as an authentication **proxy**, not a full identity provider
- It validates users against configured identity providers (Google, Okta, etc.)
- It issues its own JWTs signed with Cloudflare keys
- `authGuard()` supports both standard and Cloudflare-specific patterns automatically

### Example Code

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// No code changes needed - authGuard() automatically checks CF-Access-Jwt-Assertion
app.get('/dashboard', authGuard(), async (c) => {
  const auth = c.get('auth')

  return c.json({
    user: auth.sub,      // User ID from Access
    email: auth.email,   // User email
    groups: auth.groups  // Access groups
  })
})

export default app
```

---

## OIDC Providers

### Auth0

Verify JWTs issued by [Auth0](https://auth0.com/) using their JWKS endpoint.

#### Configuration

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
# Auth0 tenant issuer (your Auth0 domain)
JWT_ISS = "https://your-tenant.auth0.com/"

# Auth0 API identifier (from API settings)
JWT_AUD = "https://api.example.com"

# JWKS URL (public endpoint)
JWT_JWKS_URL = "https://your-tenant.auth0.com/.well-known/jwks.json"

# Token expiration and clock skew
JWT_TTL_SECONDS = "3600"    # Auth0 default: 1 hour
JWT_LEEWAY_SECONDS = "60"   # 1 minute clock tolerance
```

#### Finding Your Configuration Values

1. **Issuer** (`JWT_ISS`):
   - Auth0 Dashboard → Applications → [Your App] → Settings → Domain
   - Format: `https://your-tenant.auth0.com/`
   - **Important**: Include trailing slash

2. **Audience** (`JWT_AUD`):
   - Auth0 Dashboard → APIs → [Your API] → Settings → Identifier
   - Usually your API URL: `https://api.example.com`

3. **JWKS URL**:
   - Format: `https://your-tenant.auth0.com/.well-known/jwks.json`

#### Example Code

```typescript
app.get('/api/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Auth0 JWT claims
  return c.json({
    user: auth.sub,           // Auth0 user ID (e.g., "auth0|123...")
    email: auth.email,        // User email
    scope: auth.scope,        // OAuth scopes
    permissions: auth.permissions  // Custom permissions
  })
})
```

---

### Okta

Verify JWTs issued by [Okta](https://www.okta.com/) using their JWKS endpoint.

#### Configuration

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
# Okta authorization server issuer
JWT_ISS = "https://your-domain.okta.com/oauth2/default"

# Okta audience (typically "api://default")
JWT_AUD = "api://default"

# JWKS URL (public endpoint)
JWT_JWKS_URL = "https://your-domain.okta.com/oauth2/default/v1/keys"

# Token settings
JWT_TTL_SECONDS = "3600"
JWT_LEEWAY_SECONDS = "60"
```

#### Finding Your Configuration Values

1. **Issuer** (`JWT_ISS`):
   - Okta Admin Console → Security → API → Authorization Servers → [Your Server]
   - Default: `https://your-domain.okta.com/oauth2/default`
   - Custom: `https://your-domain.okta.com/oauth2/aus...`

2. **Audience** (`JWT_AUD`):
   - Same location as issuer → Settings → Audience
   - Default: `api://default`
   - Custom: Your API identifier

3. **JWKS URL**:
   - Format: `https://your-domain.okta.com/oauth2/{authServerId}/v1/keys`
   - Default: `https://your-domain.okta.com/oauth2/default/v1/keys`

#### Example Code

```typescript
app.get('/api/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Okta JWT claims
  return c.json({
    user: auth.sub,            // Okta user ID
    email: auth.email,
    groups: auth.groups,       // Okta groups
    scp: auth.scp              // OAuth scopes array
  })
})
```

---

### Google Workspace

Verify JWTs issued by [Google](https://developers.google.com/identity) for Workspace/Cloud Identity users.

#### Configuration

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
# Google issuer
JWT_ISS = "https://accounts.google.com"

# Google OAuth client ID (your application's client ID)
JWT_AUD = "123456789-abc.apps.googleusercontent.com"

# JWKS URL (public endpoint)
JWT_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"

# Token settings
JWT_TTL_SECONDS = "3600"
JWT_LEEWAY_SECONDS = "60"
```

#### Finding Your Configuration Values

1. **Issuer** (`JWT_ISS`):
   - Always: `https://accounts.google.com`

2. **Audience** (`JWT_AUD`):
   - [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
   - OAuth 2.0 Client ID (e.g., `123456789-abc.apps.googleusercontent.com`)

3. **JWKS URL**:
   - Always: `https://www.googleapis.com/oauth2/v3/certs`

#### Example Code

```typescript
app.get('/api/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Google ID Token claims
  return c.json({
    user: auth.sub,              // Google user ID
    email: auth.email,           // User email
    email_verified: auth.email_verified,
    name: auth.name,
    picture: auth.picture,       // Profile picture URL
    hd: auth.hd                  // Hosted domain (Workspace)
  })
})
```

---

### Azure AD (Microsoft Entra ID)

Verify JWTs issued by [Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/) (formerly Azure AD).

#### Configuration

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
# Azure AD issuer (tenant-specific)
JWT_ISS = "https://login.microsoftonline.com/your-tenant-id/v2.0"

# Application ID (Client ID from Azure portal)
JWT_AUD = "api://your-app-client-id"

# JWKS URL (public endpoint)
JWT_JWKS_URL = "https://login.microsoftonline.com/your-tenant-id/discovery/v2.0/keys"

# Token settings
JWT_TTL_SECONDS = "3600"
JWT_LEEWAY_SECONDS = "60"
```

#### Finding Your Configuration Values

1. **Tenant ID**:
   - [Azure Portal](https://portal.azure.com/) → Microsoft Entra ID → Overview
   - Copy "Tenant ID" (UUID)

2. **Issuer** (`JWT_ISS`):
   - Format: `https://login.microsoftonline.com/{tenant-id}/v2.0`
   - Or use common endpoint: `https://login.microsoftonline.com/common/v2.0` (multi-tenant)

3. **Audience** (`JWT_AUD`):
   - Azure Portal → App registrations → [Your App] → Overview → Application (client) ID
   - Format: `api://your-app-client-id` or just the client ID

4. **JWKS URL**:
   - Format: `https://login.microsoftonline.com/{tenant-id}/discovery/v2.0/keys`

#### Example Code

```typescript
app.get('/api/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Azure AD JWT claims
  return c.json({
    user: auth.sub,              // Azure AD user object ID
    oid: auth.oid,               // Object ID
    tid: auth.tid,               // Tenant ID
    email: auth.email,
    name: auth.name,
    roles: auth.roles,           // App roles
    groups: auth.groups          // Security groups
  })
})
```

---

### Generic OIDC

Configuration template for any OIDC-compliant identity provider.

#### Configuration

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
# OIDC issuer URL (from .well-known/openid-configuration)
JWT_ISS = "https://your-idp.example.com"

# Client ID or API identifier
JWT_AUD = "your-client-id"

# JWKS URL (public endpoint - get from discovery document)
JWT_JWKS_URL = "https://your-idp.example.com/.well-known/jwks.json"

# Token settings
JWT_TTL_SECONDS = "3600"
JWT_LEEWAY_SECONDS = "60"
```

#### Finding Your Configuration Values

1. **Discover OIDC Configuration**:
   ```bash
   curl https://your-idp.example.com/.well-known/openid-configuration | jq
   ```

2. **Extract Values**:
   - `issuer` → `JWT_ISS`
   - `jwks_uri` → JWKS URL secret
   - Client ID from your identity provider → `JWT_AUD`

---

## Gateway and Service Mesh Architecture

Typical flarelette deployment uses a **gateway pattern**: external OIDC tokens are verified at the gateway, which mints internal tokens for the service mesh. Both gateway and internal services use `flarelette-hono` — the only difference is the **JWKS resolution strategy**.

### Gateway Worker (External OIDC Verification)

The gateway verifies external tokens from Auth0, Okta, Cloudflare Access, etc. using **HTTP JWKS URLs**.

```toml
# Gateway wrangler.toml
name = "jwt-gateway"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
# External OIDC verification (HTTP JWKS)
JWT_ISS = "https://auth0.example.com/"
JWT_AUD = "my-app-client-id"
JWT_JWKS_URL = "https://auth0.example.com/.well-known/jwks.json"

# For minting internal tokens
JWT_PRIVATE_JWK_NAME = "GATEWAY_PRIVATE_KEY"
JWT_KID = "gateway-2025-01"
```

**Gateway code (uses flarelette-hono):**
```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import { sign } from '@chrislyons-dev/flarelette-jwt'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Token exchange endpoint - verifies external OIDC tokens
app.post('/token-exchange', authGuard(), async (c) => {
  const externalAuth = c.get('auth')  // Verified via JWT_JWKS_URL

  // Mint internal token for service mesh
  const internalToken = await sign({
    sub: externalAuth.sub,
    email: externalAuth.email,
    roles: deriveRoles(externalAuth),
    permissions: derivePermissions(externalAuth)
  })

  return c.json({ token: internalToken })
})

// Expose JWKS for internal services
app.get('/.well-known/jwks.json', async (c) => {
  // Return gateway's public keys
  return c.json({ keys: [/* ... */] })
})

export default app
```

### Internal Service Workers (Service Binding)

Internal services verify tokens from the gateway using **service bindings** (fast Worker-to-Worker RPC).

```toml
# Service wrangler.toml
name = "bond-math-service"
main = "src/index.ts"
compatibility_date = "2025-10-01"

# Service binding to gateway for JWKS
[[services]]
binding = "GATEWAY"
service = "jwt-gateway"
environment = "production"

[vars]
# Internal gateway issuer
JWT_ISS = "https://gateway.internal"

# Service-specific audience
JWT_AUD = "bond-math.api"

# Use service binding for JWKS (recommended)
JWT_JWKS_SERVICE_NAME = "GATEWAY"

# Token lifetime (short-lived internal tokens)
JWT_TTL_SECONDS = "900"        # 15 minutes
JWT_LEEWAY_SECONDS = "90"      # 90 seconds
```

**Service code (uses flarelette-hono):**
```typescript
import { Hono } from 'hono'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// All endpoints use the same authGuard()
app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')  // Verified via service binding
  return c.json({ data: [], user: auth.sub })
})

// With policies
const analystPolicy = policy().rolesAny('analyst', 'admin')
app.get('/reports', authGuard(analystPolicy), async (c) => {
  const reports = await fetchReports()
  return c.json({ reports })
})

export default app
```

---

## Comparison: Gateway vs Internal Services

| Aspect | Gateway Worker | Internal Service |
|--------|----------------|------------------|
| **Purpose** | Verify external OIDC, mint internal tokens | Verify internal tokens |
| **JWKS Source** | `JWT_JWKS_URL` (HTTP to Auth0/Okta/etc) | `JWT_JWKS_SERVICE_NAME` (service binding) |
| **Middleware** | ✅ `authGuard()` from flarelette-hono | ✅ `authGuard()` from flarelette-hono |
| **Signing** | ✅ Mints tokens with `JWT_PRIVATE_JWK` | ❌ Never mints tokens |
| **Performance** | ~50-100ms (external HTTPS + verification) | ~1-5ms (internal RPC + verification) |
| **Network** | Internet access required | Cloudflare-internal only |

**Key insight:** Both use the same `authGuard()` middleware. The difference is purely configuration — where the JWKS keys come from.

---

## Alternative: HTTP JWKS for Internal Services

If you can't use service bindings, internal services can use HTTP JWKS:

```toml
# Service wrangler.toml (alternative approach)
[vars]
JWT_ISS = "https://gateway.internal"
JWT_AUD = "bond-math.api"
JWT_JWKS_URL = "https://gateway.internal/.well-known/jwks.json"  # HTTP instead of binding
JWT_TTL_SECONDS = "900"
JWT_LEEWAY_SECONDS = "90"
```

**Trade-offs:**
- ✅ Simpler configuration (no service binding setup)
- ✅ Works with any HTTP-accessible gateway
- ❌ Slower (~10-20ms vs ~1-5ms for service bindings)
- ❌ Requires gateway to be publicly accessible or on same network

### HS512 with Shared Secret (Development Only)

```toml
# wrangler.toml
name = "bond-math-service"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
JWT_ISS = "https://gateway.internal"
JWT_AUD = "bond-math.api"
JWT_SECRET_NAME = "INTERNAL_JWT_SECRET"
JWT_TTL_SECONDS = "900"
JWT_LEEWAY_SECONDS = "90"
```

```bash
# Generate and store HS512 secret (64 bytes required as of v1.13)
npx flarelette-jwt-secret --len=64 | wrangler secret put INTERNAL_JWT_SECRET
```

**Security Warning:** HS512 shared secrets allow both gateway AND services to mint tokens. Use EdDSA for production.

---

## Mixed Authentication

Support multiple authentication methods in the same Worker.

### Cloudflare Access + API Tokens

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-10-01"

[vars]
# Cloudflare Access configuration
JWT_ISS = "https://your-team.cloudflareaccess.com"
JWT_AUD = "abc123def456ghi789"
JWT_JWKS_URL = "https://your-team.cloudflareaccess.com/cdn-cgi/access/certs"
JWT_LEEWAY_SECONDS = "300"
```

```typescript
// Both authentication methods use the same authGuard()
app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Determine source
  const cfAccess = c.req.header('CF-Access-Jwt-Assertion')
  const source = cfAccess ? 'cloudflare-access' : 'api-token'

  return c.json({
    user: auth.sub,
    source,
    data: []
  })
})
```

### Multi-Tenant with Different Configs

For separate issuers, use `authGuardWithConfig()`:

```typescript
import { authGuardWithConfig, createHS512Config } from '@chrislyons-dev/flarelette-hono'

// Tenant A configuration
const tenantAConfig = createHS512Config(
  process.env.TENANT_A_SECRET!,
  {
    iss: 'https://auth-tenant-a.example.com',
    aud: 'tenant-a'
  }
)

// Tenant B configuration
const tenantBConfig = createHS512Config(
  process.env.TENANT_B_SECRET!,
  {
    iss: 'https://auth-tenant-b.example.com',
    aud: 'tenant-b'
  }
)

// Separate routes with different configs
app.get('/tenant-a/*', authGuardWithConfig(tenantAConfig), tenantAHandler)
app.get('/tenant-b/*', authGuardWithConfig(tenantBConfig), tenantBHandler)
```

---

## Understanding JWKS URL Configuration

JWKS (JSON Web Key Set) URLs are **public endpoints** that serve public keys for JWT signature verification. They should be configured directly in `[vars]`, not as secrets.

### When to Use Each Approach

```toml
# ✅ Recommended: Direct URL in vars (for public JWKS endpoints)
[vars]
JWT_JWKS_URL = "https://auth0.example.com/.well-known/jwks.json"
```

```toml
# ⚠️ Rarely needed: Secret reference (only if JWKS URL itself is sensitive)
[vars]
JWT_JWKS_URL_NAME = "MY_JWKS_SECRET"
```

**Use `JWT_JWKS_URL` (direct URL) for:**
- Cloudflare Access (`https://your-team.cloudflareaccess.com/cdn-cgi/access/certs`)
- Auth0 (`https://your-tenant.auth0.com/.well-known/jwks.json`)
- Okta (`https://your-domain.okta.com/oauth2/default/v1/keys`)
- Google (`https://www.googleapis.com/oauth2/v3/certs`)
- Azure AD (`https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`)
- Any other OIDC provider

**Use `JWT_JWKS_URL_NAME` (secret reference) only if:**
- The JWKS URL itself contains sensitive information (rare)
- You need to dynamically switch JWKS URLs based on secrets (uncommon)

For most use cases, including all OIDC providers and Cloudflare Access, use `JWT_JWKS_URL` directly in `[vars]`.

---

## Security Best Practices

### Secret Management

1. **Never commit secrets to version control**
   - Use `wrangler secret put` for all sensitive values
   - Add secrets to `.gitignore`

2. **Rotate secrets regularly**
   - JWT signing keys: Every 90 days
   - JWKS keys: Automatic rotation via dual-key pattern

3. **Use EdDSA when possible**
   - Better security properties than HS512
   - Prevents token minting by services
   - Enables key rotation without service redeployment

### Token Lifetime

1. **Keep TTL short**
   - Internal tokens: 5-15 minutes
   - External tokens: 1 hour maximum
   - Access tokens: Per identity provider defaults

2. **Set appropriate leeway**
   - Internal services: 60-90 seconds
   - Cloudflare Access: 300 seconds (5 minutes)
   - External OIDC: 60 seconds

### Audience Validation

1. **Use service-specific audiences**
   - Prevents token reuse across services
   - Format: `service-name.api` or `service-name`

2. **Validate audience strictly**
   - `authGuard()` validates `aud` automatically
   - Tokens with wrong audience are rejected (401)

---

## Troubleshooting

### Invalid or expired token (401)

**Common causes:**

1. **Clock skew** - Increase `JWT_LEEWAY_SECONDS`
2. **Wrong issuer** - Verify `JWT_ISS` matches token `iss` claim exactly
3. **Wrong audience** - Verify `JWT_AUD` matches token `aud` claim
4. **JWKS URL incorrect** - Test JWKS endpoint manually with curl
5. **Token expired** - Check token TTL and current time

**Debug steps:**

```bash
# Check JWKS endpoint is accessible
curl https://your-idp.example.com/.well-known/jwks.json

# Decode JWT (without verification) to inspect claims
# Use https://jwt.io or:
echo "eyJhbGc..." | cut -d. -f2 | base64 -d | jq

# Verify issuer and audience match configuration
```

### Missing claims in JWT payload

**OIDC providers include different claims:**

- Always present: `iss`, `sub`, `aud`, `exp`, `iat`
- Optional: `email`, `name`, `groups`, `roles`, `permissions`

**Solution:** Always check for undefined before accessing optional claims:

```typescript
const email = auth.email ?? 'unknown@example.com'
const roles = auth.roles ?? []
```

---

## Next Steps

- **Basic setup**: Start with [Quick Start](quick-start.md)
- **Advanced config**: Review [JWT Integration Guide](../design/jwt-integration.md)
- **Testing**: See [Testing Guide](../advanced/testing.md)
