# Quick Start

**Goal**: Get a protected route working with JWT authentication in 5 minutes.

---

## 1. Install Dependencies

```bash
npm install hono @chrislyons-dev/flarelette-jwt @chrislyons-dev/flarelette-hono
```

---

## 2. Configure Environment

Add to `wrangler.toml`:

```toml
[vars]
JWT_ISS = "https://gateway.internal"
JWT_AUD = "my-service"
JWT_SECRET_NAME = "INTERNAL_JWT_SECRET"
```

Generate and store secret:

```bash
# v1.13+ requires 64-byte minimum for HS512
npx flarelette-jwt-secret --len=64 | wrangler secret put INTERNAL_JWT_SECRET
```

---

## 3. Create Your Worker

**File**: `src/index.ts`

```typescript
import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Public endpoint
app.get('/health', (c) => c.json({ ok: true }))

// Protected endpoint
app.get('/protected', authGuard(), async (c) => {
  const auth = c.get('auth')
  return c.json({
    message: 'Authenticated',
    user: auth.sub,
    issuer: auth.iss,
  })
})

export default app
```

---

## 4. Run Locally

```bash
wrangler dev
```

---

## 5. Test

Without token (expect 401):

```bash
curl http://localhost:8787/protected
# {"error":"unauthorized"}
```

With valid token:

```bash
# Generate a test token first - see examples/authenticated/ directory
curl -H "Authorization: Bearer <your-jwt>" http://localhost:8787/protected
# {"message":"Authenticated","user":"...","issuer":"..."}
```

---

## Next Steps

- **Add authorization**: See [Authorization Guide](../guides/authorization.md) for role-based access control
- **Secure input**: See [Input Validation Guide](../guides/validation.md) for request validation
- **Production**: See [JWT Integration Guide](../design/jwt-integration.md) for EdDSA and key rotation
