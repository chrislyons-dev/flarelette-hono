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

`authGuard()` extracts the JWT from the `Authorization` header:

```http
GET /protected HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...
```

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

## Next Steps

- **Add authorization**: See [Authorization Guide](authorization.md) for role-based and permission-based policies
- **Understand JWT structure**: See [JWT Integration Guide](../design/jwt-integration.md) for complete JWT payload structure and production setup
