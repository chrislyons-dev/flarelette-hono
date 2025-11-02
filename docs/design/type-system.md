# Type System

**What**: Understanding JWT payload types and handling optional claims safely.

**Why**: All JWT claims are optional. Type-safe access prevents runtime errors and security issues.

---

## JWT Payload Type

Import from `@chrislyons-dev/flarelette-jwt`:

```typescript
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'

app.get('/profile', authGuard(), async (c) => {
  const auth: JwtPayload = c.get('auth')
  // auth is fully typed
})
```

**Never redefine this type** — always import from `@chrislyons-dev/flarelette-jwt`.

---

## Standard JWT Claims

### Always Present (Required by authGuard)

```typescript
auth.iss  // string - Issuer
auth.sub  // string - Subject (user ID)
```

These are validated by `authGuard()` before injection.

### Optional Standard Claims

```typescript
auth.aud   // string | string[] | undefined - Audience
auth.exp   // number | undefined - Expiration timestamp
auth.iat   // number | undefined - Issued at timestamp
auth.nbf   // number | undefined - Not before timestamp
auth.jti   // string | undefined - JWT ID
```

---

## OIDC Claims (Optional)

```typescript
auth.name              // string | undefined
auth.email             // string | undefined
auth.email_verified    // boolean | undefined
auth.phone_number      // string | undefined
auth.picture           // string | undefined
auth.client_id         // string | undefined
auth.scope             // string | undefined
```

---

## Authorization Claims (Optional)

```typescript
auth.roles        // string[] | undefined
auth.permissions  // string[] | undefined
auth.groups       // string[] | undefined
auth.user_role    // string | undefined
auth.department   // string | undefined
```

---

## Multi-Tenant Claims (Optional)

```typescript
auth.tid      // string | undefined - Tenant ID
auth.org_id   // string | undefined - Organization ID
```

---

## Actor Claim (RFC 8693 Token Exchange)

For service-to-service delegation:

```typescript
import type { ActorClaim } from '@chrislyons-dev/flarelette-jwt'

auth.act  // ActorClaim | undefined

interface ActorClaim {
  iss: string           // Issuer of the acting service
  sub: string           // Service identifier
  act?: ActorClaim      // Recursive delegation chain
}
```

---

## Safe Access Patterns

### Check Before Use

All optional claims must be checked:

```typescript
app.get('/profile', authGuard(), async (c) => {
  const auth = c.get('auth')

  // ❌ Wrong - email might be undefined
  const email = auth.email.toLowerCase()

  // ✅ Correct - check first
  if (!auth.email) {
    return c.json({ error: 'No email in token' }, 400)
  }
  const email = auth.email.toLowerCase()

  return c.json({ email })
})
```

### Optional Chaining

Use `?.` for safe access:

```typescript
app.get('/org-data', authGuard(), async (c) => {
  const auth = c.get('auth')

  // ✅ Safe - returns undefined if org_id doesn't exist
  const orgId = auth.org_id?.toUpperCase()

  if (!orgId) {
    return c.json({ error: 'No organization context' }, 400)
  }

  return c.json({ orgId })
})
```

### Nullish Coalescing

Provide defaults:

```typescript
app.get('/settings', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Use email or fallback to sub
  const displayId = auth.email ?? auth.sub

  // Use name or default
  const displayName = auth.name ?? 'Anonymous'

  return c.json({ displayId, displayName })
})
```

---

## Handling Arrays

### Roles Array

```typescript
app.get('/admin', authGuard(), async (c) => {
  const auth = c.get('auth')

  // ❌ Wrong - roles might be undefined
  if (auth.roles.includes('admin')) { }

  // ✅ Correct - check for undefined first
  if (!auth.roles || !auth.roles.includes('admin')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  return c.json({ admin: true })
})
```

### Permissions Array

```typescript
app.post('/reports', authGuard(), async (c) => {
  const auth = c.get('auth')

  const hasPermission = auth.permissions?.includes('write:reports') ?? false

  if (!hasPermission) {
    return c.json({ error: 'forbidden' }, 403)
  }

  return c.json({ created: true })
})
```

---

## Audience as String or Array

The `aud` claim can be a string or array:

```typescript
function hasAudience(auth: JwtPayload, expected: string): boolean {
  if (typeof auth.aud === 'string') {
    return auth.aud === expected
  }

  if (Array.isArray(auth.aud)) {
    return auth.aud.includes(expected)
  }

  return false
}

app.get('/data', authGuard(), async (c) => {
  const auth = c.get('auth')

  if (!hasAudience(auth, 'data-api')) {
    return c.json({ error: 'Wrong audience' }, 403)
  }

  return c.json({ data: [] })
})
```

---

## Multi-Tenant Patterns

### Organization-Scoped Data

```typescript
app.get('/orgs/:orgId/data', authGuard(), async (c) => {
  const auth = c.get('auth')
  const requestedOrgId = c.req.param('orgId')

  // Verify user belongs to organization
  if (auth.org_id !== requestedOrgId) {
    return c.json({ error: 'forbidden' }, 403)
  }

  // Query data scoped to organization
  const data = await fetchOrgData(requestedOrgId)

  return c.json({ data })
})
```

### Tenant-Scoped Queries

```typescript
app.get('/reports', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Require tenant context
  if (!auth.tid) {
    return c.json({ error: 'No tenant context' }, 400)
  }

  // All queries automatically scoped to tenant
  const reports = await db
    .select()
    .from('reports')
    .where({ tenant_id: auth.tid })

  return c.json({ reports })
})
```

---

## Actor Claim (Service Delegation)

### Check Acting Service

```typescript
app.post('/internal/action', authGuard(), async (c) => {
  const auth = c.get('auth')

  // Check if request is from service acting on behalf of user
  if (!auth.act) {
    return c.json({ error: 'Direct user access not allowed' }, 403)
  }

  // Verify acting service
  if (auth.act.sub !== 'gateway-service') {
    return c.json({ error: 'Unauthorized service' }, 403)
  }

  // Original user is in auth.sub
  // Acting service is in auth.act.sub
  return c.json({
    user: auth.sub,
    actingService: auth.act.sub,
  })
})
```

### Delegation Chain

```typescript
app.get('/delegated', authGuard(), async (c) => {
  const auth = c.get('auth')

  function getDelegationChain(act: ActorClaim | undefined): string[] {
    if (!act) return []
    return [act.sub, ...getDelegationChain(act.act)]
  }

  const chain = getDelegationChain(auth.act)

  return c.json({
    user: auth.sub,
    delegationChain: chain,
  })
})
```

---

## Type Guards

Create reusable type guards for complex checks:

```typescript
function hasOrgContext(auth: JwtPayload): auth is JwtPayload & { org_id: string } {
  return typeof auth.org_id === 'string' && auth.org_id.length > 0
}

app.get('/org-data', authGuard(), async (c) => {
  const auth = c.get('auth')

  if (!hasOrgContext(auth)) {
    return c.json({ error: 'No organization context' }, 400)
  }

  // TypeScript now knows auth.org_id is string
  const data = await fetchOrgData(auth.org_id)

  return c.json({ data })
})
```

---

## Custom Claims

JWT can include custom claims:

```typescript
// Extend type in your application (optional)
interface AppJwtPayload extends JwtPayload {
  customClaim?: string
}

app.get('/custom', authGuard(), async (c) => {
  const auth = c.get('auth') as AppJwtPayload

  const custom = auth.customClaim ?? 'default'

  return c.json({ custom })
})
```

**Note**: Custom claims are always optional and should be validated at runtime.

---

## Common Mistakes

### Mistake 1: Not Checking Undefined

```typescript
// ❌ Wrong
const email = auth.email.toLowerCase()

// ✅ Correct
const email = auth.email?.toLowerCase() ?? null
```

### Mistake 2: Assuming Arrays Exist

```typescript
// ❌ Wrong
if (auth.roles.length > 0) { }

// ✅ Correct
if (auth.roles && auth.roles.length > 0) { }
```

### Mistake 3: String/Array Confusion

```typescript
// ❌ Wrong - aud might be array
if (auth.aud === 'my-service') { }

// ✅ Correct - handle both
const hasAud = typeof auth.aud === 'string'
  ? auth.aud === 'my-service'
  : auth.aud?.includes('my-service') ?? false
```

### Mistake 4: Redefining Types

```typescript
// ❌ Wrong - don't redefine
interface JwtPayload { sub: string }

// ✅ Correct - import
import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'
```

---

## Next Steps

- **See examples**: Check `examples/authenticated/` for complete working code
- **JWT structure**: See [JWT Integration Guide](jwt-integration.md) for token creation and validation
- **Architecture**: See [Architecture Guide](architecture.md) for design principles
