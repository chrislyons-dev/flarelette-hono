# Authorization

**What**: Control *what* authenticated users can access based on roles and permissions.

**Why**: Authentication confirms *who* you are. Authorization determines *what* you can do.

---

## Policy Builder

Use `policy()` to create declarative access control rules:

```typescript
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'

const adminPolicy = policy().rolesAny('admin')

app.get('/admin', authGuard(adminPolicy), async (c) => {
  return c.json({ message: 'Admin access granted' })
})
```

---

## Role-Based Access

### Single Role Required

```typescript
const adminPolicy = policy().rolesAny('admin')

app.get('/admin/users', authGuard(adminPolicy), async (c) => {
  const auth = c.get('auth')
  return c.json({ users: [], requestedBy: auth.sub })
})
```

### Multiple Roles (Any)

User must have **at least one** of the specified roles:

```typescript
const analystPolicy = policy()
  .rolesAny('admin', 'analyst', 'viewer')

app.get('/reports', authGuard(analystPolicy), async (c) => {
  const auth = c.get('auth')
  return c.json({
    reports: [],
    userRoles: auth.roles
  })
})
```

### Multiple Roles (All)

User must have **all** specified roles:

```typescript
const seniorAdminPolicy = policy()
  .rolesAll('admin', 'senior', 'verified')

app.delete('/admin/critical', authGuard(seniorAdminPolicy), async (c) => {
  return c.json({ deleted: true })
})
```

---

## Permission-Based Access

### Single Permission Required

```typescript
const readPolicy = policy().needAll('read:reports')

app.get('/reports', authGuard(readPolicy), async (c) => {
  return c.json({ reports: [] })
})
```

### Multiple Permissions (Any)

User must have **at least one** permission:

```typescript
const dataAccessPolicy = policy()
  .needAny('read:reports', 'read:analytics', 'read:data')

app.get('/data', authGuard(dataAccessPolicy), async (c) => {
  const auth = c.get('auth')
  return c.json({
    data: [],
    permissions: auth.permissions
  })
})
```

### Multiple Permissions (All)

User must have **all** permissions:

```typescript
const writePolicy = policy()
  .needAll('write:reports', 'audit:log')

app.post('/reports', authGuard(writePolicy), async (c) => {
  return c.json({ created: true })
})
```

---

## Combining Roles and Permissions

Combine roles and permissions for complex policies:

```typescript
const complexPolicy = policy()
  .rolesAny('admin', 'analyst')      // Admin OR analyst
  .needAll('read:reports')            // AND must have read permission

app.get('/reports/sensitive', authGuard(complexPolicy), async (c) => {
  const auth = c.get('auth')

  return c.json({
    reports: [],
    userRoles: auth.roles,
    userPermissions: auth.permissions,
  })
})
```

Multiple role requirements:

```typescript
const strictPolicy = policy()
  .rolesAll('verified', 'approved')   // Must have BOTH roles
  .needAny('read:data', 'read:reports') // AND at least ONE permission

app.get('/protected-data', authGuard(strictPolicy), async (c) => {
  return c.json({ data: [] })
})
```

---

## Error Responses

### 403 Forbidden

Returned when:
- User is authenticated (token is valid)
- User does not meet policy requirements (missing roles or permissions)

```json
{
  "error": "forbidden"
}
```

### 401 vs 403

| Error | Meaning | Example |
|-------|---------|---------|
| **401 Unauthorized** | Invalid or missing JWT token | No `Authorization` header, expired token |
| **403 Forbidden** | Valid token, insufficient permissions | User lacks required role or permission |

---

## JWT Payload Structure

For policies to work, JWT tokens must include `roles` and/or `permissions` claims:

### Roles Example

```json
{
  "sub": "user-123",
  "iss": "https://gateway.internal",
  "aud": "my-service",
  "roles": ["admin", "verified"]
}
```

### Permissions Example

```json
{
  "sub": "user-123",
  "iss": "https://gateway.internal",
  "aud": "my-service",
  "permissions": ["read:reports", "write:reports", "audit:log"]
}
```

### Both Roles and Permissions

```json
{
  "sub": "user-123",
  "iss": "https://gateway.internal",
  "aud": "my-service",
  "roles": ["analyst", "verified"],
  "permissions": ["read:reports", "read:analytics"]
}
```

---

## Reusable Policies

Define policies once and reuse across routes:

```typescript
// Define policies
const policies = {
  admin: policy().rolesAny('admin'),
  analyst: policy().rolesAny('admin', 'analyst').needAll('read:reports'),
  writer: policy().needAll('write:reports', 'audit:log'),
}

// Apply to routes
app.get('/admin/users', authGuard(policies.admin), handlerFn)
app.get('/reports', authGuard(policies.analyst), handlerFn)
app.post('/reports', authGuard(policies.writer), handlerFn)
```

---

## Dynamic Authorization

For complex authorization logic that can't be expressed in policies, check claims in the handler:

```typescript
app.get('/orgs/:orgId/data', authGuard(), async (c) => {
  const auth = c.get('auth')
  const requestedOrgId = c.req.param('orgId')

  // Check if user belongs to requested organization
  if (auth.org_id !== requestedOrgId) {
    return c.json({ error: 'forbidden' }, 403)
  }

  return c.json({ data: [] })
})
```

---

## Policy Testing

Test policies with different JWT payloads:

```typescript
import { sign } from '@chrislyons-dev/flarelette-jwt'

// Admin user
const adminToken = await sign({
  sub: 'admin-user',
  iss: 'https://gateway.internal',
  aud: 'my-service',
  roles: ['admin'],
}, { ttlSeconds: 3600 })

// Analyst user
const analystToken = await sign({
  sub: 'analyst-user',
  iss: 'https://gateway.internal',
  aud: 'my-service',
  roles: ['analyst'],
  permissions: ['read:reports'],
}, { ttlSeconds: 3600 })
```

Test with curl:

```bash
# Should succeed (admin)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8787/admin/users

# Should fail with 403 (not admin)
curl -H "Authorization: Bearer $ANALYST_TOKEN" \
  http://localhost:8787/admin/users
```

---

## Next Steps

- **Input validation**: See [Input Validation Guide](validation.md) for securing request data
- **Structured logging**: See [Logging Guide](logging.md) for audit trails
- **JWT structure**: See [JWT Integration Guide](../design/jwt-integration.md) for complete token format
