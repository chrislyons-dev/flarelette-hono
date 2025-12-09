# Authentication

**What**: Verify JWT tokens and inject authenticated user context into requests.

**Why**: Authentication confirms *who* is making the request before processing it.

---

## Basic Usage

### Protect a Route

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

app.get('/protected', authGuard(), async (c) => {
  const auth = c.get('auth')
  return c.json({ user: auth.sub })
})
```

---

## How It Works

### 1. Token Extraction

`authGuard()` extracts the JWT from either:

- `Authorization` header (standard Bearer token):
```http
GET /protected HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...
```

- `CF-Access-Jwt-Assertion` header (Cloudflare Access):
```http
GET /protected HTTP/1.1
CF-Access-Jwt-Assertion: eyJhbGciOiJFZERTQSIsImtpZCI6IjEyMyIsInR5cCI6IkpXVCJ9...
```

**Header precedence:** `Authorization` is checked first; `CF-Access-Jwt-Assertion` is used as fallback if Authorization is missing or invalid.

### 2. Token Verification

The middleware verifies:
- Signature is valid (using `JWT_SECRET` or JWKS)
- Token has not expired (`exp` claim)
- Issuer matches `JWT_ISS` environment variable
- Audience matches `JWT_AUD` environment variable

### 3. Context Injection

If valid, the decoded JWT payload is injected into the Hono context:

```typescript
const auth = c.get('auth')
// auth is type JwtPayload from @chrislyons-dev/flarelette-jwt
```

---

## Accessing Auth Context

### Standard Claims

```typescript
app.get('/me', authGuard(), async (c) => {
  const auth = c.get('auth')

  return c.json({
    sub: auth.sub,        // Subject (user ID)
    iss: auth.iss,        // Issuer
    aud: auth.aud,        // Audience (string or string[])
    exp: auth.exp,        // Expiration timestamp
    iat: auth.iat,        // Issued at timestamp
    jti: auth.jti,        // JWT ID (optional)
  })
})
```

### Custom Claims

JWT payload can include custom claims:

```typescript
app.get('/profile', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Optional claims - always check for undefined
  const email = auth.email      // OIDC claim
  const name = auth.name        // OIDC claim
  const orgId = auth.org_id     // Custom claim

  if (!orgId) {
    return c.json({ error: 'No organization context' }, 400)
  }

  return c.json({ email, name, orgId })
})
```

---

## Error Responses

### 401 Unauthorized

Returned when:
- No `Authorization` header present
- Token is malformed or invalid
- Token signature verification fails
- Token is expired
- Issuer (`iss`) doesn't match `JWT_ISS`
- Audience (`aud`) doesn't match `JWT_AUD`

```json
{
  "error": "unauthorized"
}
```

### Generic Error Messages

Error responses never leak token details. All authentication failures return the same generic message to prevent timing attacks.

---

## Apply to Multiple Routes

### Global Middleware

Protect all routes:

```typescript
app.use('*', authGuard())

app.get('/users', async (c) => {
  const auth = c.get('auth')  // Always available
  return c.json({ users: [] })
})

app.get('/posts', async (c) => {
  const auth = c.get('auth')  // Always available
  return c.json({ posts: [] })
})
```

### Route Group

Protect specific route groups:

```typescript
const api = new Hono<HonoEnv>()

// Public routes
api.get('/health', (c) => c.json({ ok: true }))

// Protected routes
api.use('/admin/*', authGuard())
api.get('/admin/users', async (c) => {
  const auth = c.get('auth')
  return c.json({ users: [] })
})

app.route('/api', api)
```

---

## Testing Locally

### Generate Test Token

Use `examples/authenticated/` directory for token generation utilities, or use jwt-kit directly:

```typescript
import { sign } from '@chrislyons-dev/flarelette-jwt'

const token = await sign(
  {
    sub: 'test-user-123',
    iss: 'https://gateway.internal',
    aud: 'my-service',
  },
  { ttlSeconds: 3600 }
)

console.log(token)
```

### Test with curl

```bash
export TOKEN="eyJhbGc..."

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/protected
```

---

## Cloudflare Access Integration

Workers behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) automatically receive authenticated user context via the `CF-Access-Jwt-Assertion` header.

### What is Cloudflare Access?

Cloudflare Access provides zero-trust authentication for your applications:
- SSO integration (Google, GitHub, Okta, etc.)
- Managed authentication layer before requests reach your Worker
- Automatic JWT generation and validation

### Setup

**1. Configure Cloudflare Access** in the [Zero Trust dashboard](https://one.dash.cloudflare.com/)

**2. Configure your Worker:**

```toml
# wrangler.toml
[vars]
JWT_ISS = "https://your-team.cloudflareaccess.com"
JWT_AUD = "your-application-aud-tag"

# JWKS URL is a public endpoint - no need for secret
JWT_JWKS_URL = "https://your-team.cloudflareaccess.com/cdn-cgi/access/certs"
```

**3. Use `authGuard()` normally — no code changes required:**

```typescript
app.get('/dashboard', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Token extracted from CF-Access-Jwt-Assertion header
  return c.json({
    user: auth.sub,
    email: auth.email,
    groups: auth.groups  // Cloudflare Access groups
  })
})
```

### Mixed Authentication

Support both Cloudflare Access (browser users) and API tokens (service-to-service):

```typescript
app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Works with both:
  // - CF-Access-Jwt-Assertion (browser users via Access)
  // - Authorization: Bearer <token> (API clients)

  const source = c.req.header('CF-Access-Jwt-Assertion') ? 'access' : 'api'

  return c.json({
    data: [],
    user: auth.sub,
    source
  })
})
```

### Security Considerations

- **Token lifetime**: Cloudflare Access tokens typically expire after 1 hour
- **Clock skew**: Set `JWT_LEEWAY_SECONDS=300` (5 minutes) to handle timing differences
- **JWKS caching**: Public keys are cached for 5 minutes; rotation is handled automatically
- **Header precedence**: `Authorization` takes priority over `CF-Access-Jwt-Assertion`

### Troubleshooting

**401 Unauthorized errors:**

1. Verify issuer matches your team domain:
   ```bash
   # Should match JWT_ISS
   curl https://your-team.cloudflareaccess.com/cdn-cgi/access/certs | jq '.keys[0]'
   ```

2. Check application AUD tag in Access policy settings

3. Ensure JWKS URL is accessible:
   ```bash
   curl https://your-team.cloudflareaccess.com/cdn-cgi/access/certs
   ```

**Missing user context:**

Cloudflare Access JWT claims vary by identity provider. Common claims:
- `sub` - User identifier (always present)
- `email` - User email (most providers)
- `name` - Display name (some providers)
- `groups` - Access groups (if configured)

Always check for `undefined` before using optional claims.

---

## Next Steps

- **Add authorization**: See [Authorization Guide](authorization.md) for role-based and permission-based policies
- **Understand JWT structure**: See [JWT Integration Guide](../design/jwt-integration.md) for complete JWT payload structure and production setup
- **Cloudflare Access docs**: See [Cloudflare Access documentation](https://developers.cloudflare.com/cloudflare-one/policies/access/) for identity provider configuration
