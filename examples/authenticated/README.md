# Authenticated Example

Complete authentication and authorization example with flarelette-hono.

## Overview

This example demonstrates:
- **Authentication** - JWT verification with authGuard
- **Role-based access control** (RBAC) - Using `rolesAny` and `rolesAll`
- **Permission-based access control** - Using `needAny` and `needAll`
- **Complex policies** - Combining multiple authorization rules
- **Multi-tenant isolation** - Enforcing organization boundaries
- **Delegated access** - RFC 8693 token exchange patterns

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Public Routes                                           │
│ - /                                                     │
│ - /health                                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Authenticated Routes (authGuard only)                   │
│ - /profile                                              │
│ - /settings                                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Role-Based Routes                                       │
│ - /admin/* - rolesAny('admin', 'superuser')            │
│ - /analytics - rolesAny('analyst', 'admin')            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Permission-Based Routes                                 │
│ - GET /data - needAny('read:data', 'read:all')         │
│ - POST /data - needAll('write:data')                    │
│ - DELETE /data/:id - admin + needAll('delete:data')     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Complex Policies                                        │
│ - /reports - analyst role + read permissions            │
│ - /export - verified + approved roles + export perm     │
└─────────────────────────────────────────────────────────┘
```

## Setup

1. Install dependencies:
```bash
npm install hono @chrislyons-dev/flarelette-hono
npm install -D wrangler
```

2. Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

3. Configure as Cloudflare Workers secret:
```bash
npx wrangler secret put JWT_SECRET
```

4. Update `wrangler.toml` with your issuer and audience.

## Run Locally

```bash
npx wrangler dev
```

## Testing Endpoints

### Public Routes

```bash
curl http://localhost:8787/
curl http://localhost:8787/health
```

### Authenticated Routes

Requires valid JWT with matching issuer and audience:

```bash
# User profile
curl http://localhost:8787/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Settings
curl http://localhost:8787/settings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Role-Based Routes

Requires JWT with `roles` claim:

```bash
# Admin dashboard - requires admin or superuser role
curl http://localhost:8787/admin/dashboard \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"

# Analytics - requires analyst or admin role
curl http://localhost:8787/analytics \
  -H "Authorization: Bearer ANALYST_JWT_TOKEN"
```

**Example JWT payload for admin:**
```json
{
  "iss": "https://your-issuer.example.com",
  "aud": "your-service-id",
  "sub": "user-123",
  "roles": ["admin"],
  "exp": 1234567890
}
```

### Permission-Based Routes

Requires JWT with `permissions` claim:

```bash
# Read data - requires read:data or read:all permission
curl http://localhost:8787/data \
  -H "Authorization: Bearer READ_JWT_TOKEN"

# Write data - requires write:data permission
curl -X POST http://localhost:8787/data \
  -H "Authorization: Bearer WRITE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"New Item"}'

# Delete data - requires admin role AND delete:data permission
curl -X DELETE http://localhost:8787/data/123 \
  -H "Authorization: Bearer DELETE_JWT_TOKEN"
```

**Example JWT payload with permissions:**
```json
{
  "iss": "https://your-issuer.example.com",
  "aud": "your-service-id",
  "sub": "user-123",
  "permissions": ["read:data", "write:data"],
  "exp": 1234567890
}
```

### Complex Policies

```bash
# Reports - requires analyst/admin role AND read:reports permission
curl http://localhost:8787/reports \
  -H "Authorization: Bearer ANALYST_JWT_TOKEN"

# Export - requires verified + approved roles AND export:data permission
curl http://localhost:8787/export \
  -H "Authorization: Bearer EXPORT_JWT_TOKEN"
```

**Example JWT payload for reports:**
```json
{
  "iss": "https://your-issuer.example.com",
  "aud": "your-service-id",
  "sub": "user-123",
  "roles": ["analyst"],
  "permissions": ["read:reports"],
  "exp": 1234567890
}
```

### Multi-Tenant Routes

```bash
# Organization data - checks org_id matches
curl http://localhost:8787/orgs/org-123/data \
  -H "Authorization: Bearer ORG_JWT_TOKEN"
```

**Example JWT payload with org_id:**
```json
{
  "iss": "https://your-issuer.example.com",
  "aud": "your-service-id",
  "sub": "user-123",
  "org_id": "org-123",
  "exp": 1234567890
}
```

### Delegated Access (RFC 8693)

```bash
# Service endpoint - accepts delegated tokens
curl http://localhost:8787/internal/process \
  -H "Authorization: Bearer DELEGATED_JWT_TOKEN"
```

**Example delegated JWT payload:**
```json
{
  "iss": "https://your-issuer.example.com",
  "aud": "your-service-id",
  "sub": "user-123",
  "act": {
    "sub": "service-worker",
    "iss": "https://internal-services.example.com"
  },
  "exp": 1234567890
}
```

## Policy Patterns

### Authentication Only

No authorization - just verify the user is authenticated:

```typescript
app.get('/profile', authGuard(), (c) => {
  const auth = c.get('auth')
  return c.json({ user: auth.sub })
})
```

### Role-Based (Any)

User must have at least one of the specified roles:

```typescript
const adminPolicy = policy()
  .rolesAny('admin', 'superuser')
  .build()

app.get('/admin', authGuard(adminPolicy), (c) => {
  return c.json({ ok: true })
})
```

### Role-Based (All)

User must have all specified roles:

```typescript
const strictPolicy = policy()
  .rolesAll('verified', 'approved', 'active')
  .build()
```

### Permission-Based (Any)

User must have at least one of the specified permissions:

```typescript
const readPolicy = policy()
  .needAny('read:data', 'read:all')
  .build()
```

### Permission-Based (All)

User must have all specified permissions:

```typescript
const writePolicy = policy()
  .needAll('write:data', 'write:logs')
  .build()
```

### Complex Policies

Combine multiple rules - all must pass:

```typescript
const complexPolicy = policy()
  .rolesAny('analyst', 'admin')           // At least one role
  .rolesAll('verified', 'approved')       // All these roles
  .needAny('read:reports', 'read:all')    // At least one permission
  .needAll('export:data', 'audit:log')    // All these permissions
  .build()
```

## Error Responses

### 401 Unauthorized

Missing or invalid token:
```json
{
  "error": "unauthorized",
  "message": "Missing or invalid Authorization header"
}
```

### 403 Forbidden

Valid token but insufficient permissions:
```json
{
  "error": "forbidden",
  "message": "Insufficient permissions"
}
```

## Deploy

```bash
npx wrangler deploy
```

## Security Best Practices

1. **Use Secrets** - Never commit JWT_SECRET to version control
2. **Short TTL** - Use 5-15 minutes for production tokens
3. **EdDSA Preferred** - Use EdDSA instead of HS512 for production
4. **Rotate Keys** - Rotate secrets every 90 days
5. **HTTPS Only** - Always use HTTPS in production
6. **Validate Claims** - Always check org_id for multi-tenant isolation
7. **Audit Logs** - Log all access attempts for security monitoring
8. **Rate Limiting** - Implement rate limiting for auth endpoints

## Production Checklist

- [ ] Secrets stored in Cloudflare Workers Secrets
- [ ] EdDSA configured with JWKS service binding
- [ ] Short TTL configured (5-15 minutes)
- [ ] Key rotation strategy in place
- [ ] Audit logging enabled
- [ ] Rate limiting configured
- [ ] HTTPS enforced
- [ ] Error monitoring configured
