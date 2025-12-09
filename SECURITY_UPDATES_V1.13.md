# Security Updates in flarelette-jwt v1.13

**Date**: 2025-12-08
**Package**: @chrislyons-dev/flarelette-jwt v1.13.0
**Impact**: flarelette-hono (already updated to v1.13+)

---

## Summary

flarelette-jwt v1.13 introduces critical security hardening that prevents common JWT vulnerabilities. All flarelette-hono documentation has been updated to reflect these requirements.

---

## Breaking Changes

### 1. HS512 Minimum Secret Length: 64 Bytes ⚠️

**Change**: HS512 secrets now require **minimum 64 bytes** (512 bits). Shorter secrets cause startup errors.

**Before (v1.12 and earlier):**
```bash
# Any length worked (insecure)
openssl rand -base64 32  # Only 32 bytes - now FAILS
```

**After (v1.13+):**
```bash
# Requires 64-byte minimum
npx flarelette-jwt-secret --len=64  # 64 bytes - REQUIRED
```

**Error if too short:**
```
Error: JWT secret too short: 32 bytes, need >= 64 for HS512 (use 'npx flarelette-jwt-secret --len=64')
```

**Rationale:**
- SHA-512 digest size is 512 bits (64 bytes)
- Shorter secrets reduce security below algorithm capability
- Prevents brute-force attacks on weak secrets
- Industry best practice for HMAC-SHA-512

**Migration Required:**
```bash
# Regenerate all HS512 secrets
npx flarelette-jwt-secret --len=64 > .env.secret

# Update Cloudflare Workers secrets
wrangler secret put JWT_SECRET < .env.secret

# Shred temporary file
shred -u .env.secret
```

### 2. Mode Exclusivity (Algorithm Confusion Prevention) ⚠️

**Change**: Cannot configure both HS512 and asymmetric (EdDSA/RSA) modes simultaneously.

**Before (v1.12 and earlier):**
```toml
# This was allowed but dangerous
[vars]
JWT_SECRET_NAME = "MY_SECRET"
JWT_PUBLIC_JWK_NAME = "MY_PUBLIC_KEY"  # Mode confusion possible
```

**After (v1.13+):**
```
Configuration error: Both HS512 (JWT_SECRET) and asymmetric (JWT_PUBLIC_JWK/JWT_JWKS_*) secrets configured. Choose one to prevent algorithm confusion attacks.
```

**Choose ONE mode:**
- ✅ **HS512**: `JWT_SECRET_NAME` or `JWT_SECRET`
- ✅ **EdDSA**: `JWT_PRIVATE_JWK_NAME` + `JWT_PUBLIC_JWK_NAME`
- ✅ **RSA (external OIDC)**: `JWT_JWKS_URL`
- ❌ **Both**: Fails with configuration error

**Rationale:**
- Prevents CVE-2015-9235 (RS256 public key as HMAC secret)
- Prevents mode confusion attacks
- Ensures single algorithm per deployment

---

## New Security Features

### 1. HTTP JWKS URL Support

**Feature**: External OIDC provider support via `JWT_JWKS_URL`

**Supported Providers:**
- Auth0: `https://tenant.auth0.com/.well-known/jwks.json`
- Okta: `https://domain.okta.com/oauth2/default/v1/keys`
- Google: `https://www.googleapis.com/oauth2/v3/certs`
- Azure AD: `https://login.microsoftonline.com/tenant-id/discovery/v2.0/keys`
- Cloudflare Access: `https://team.cloudflareaccess.com/cdn-cgi/access/certs`

**Security:**
- HTTPS-only (except localhost for testing)
- Config-pinned URLs (never from token headers)
- 5-minute cache TTL (configurable)
- Prevents JWKS injection attacks

### 2. RSA Verification (RS256/384/512)

**Feature**: Verification-only support for RSA-signed tokens from external OIDC providers

**Use Cases:**
- Gateway workers verifying Auth0, Okta, Google, Azure AD tokens
- External identity provider integration
- Verification only (no signing capability)

**Algorithm Whitelists:**
- HS512 mode: `['HS512']` only
- EdDSA/RSA mode: `['EdDSA', 'RS256', 'RS384', 'RS512']` only
- No `none` algorithm ever supported

### 3. Enhanced Attack Prevention

**Protected Against:**

| Attack | CVE | Protection |
|--------|-----|------------|
| `alg: none` | CVE-2015-2951 | Strict algorithm whitelisting |
| RS256 key as HMAC | CVE-2015-9235 | Mode conflict detection |
| JWKS injection (`jku`) | N/A | Config-only URLs |
| `kid` injection | N/A | Strict equality lookup |
| Weak secrets | N/A | 64-byte minimum |
| Algorithm confusion | N/A | Single-mode enforcement |

**Implementation:**
- Mode determined by server config only (never from token)
- `jku`/`x5u` headers completely ignored
- `kid` treated as pure lookup key (no interpolation)
- Algorithm pinned at key import time

---

## Documentation Updates

All flarelette-hono documentation updated:

### Updated Files

✅ **README.md**
- Security Requirements section added
- HS512 64-byte minimum documented
- Mode exclusivity explained
- CVE references added

✅ **docs/getting-started/configuration.md**
- Security warnings added at top
- All secret generation examples updated
- 64-byte requirement emphasized

✅ **docs/getting-started/quick-start.md**
- Secret generation commands updated
- 64-byte minimum noted

✅ **docs/index.md**
- Quick start updated with v1.13 requirements

✅ **docs/design/jwt-integration.md**
- All HS512 examples updated (3 instances)
- Secret rotation examples updated

### Key Changes

**Before:**
```bash
openssl rand -base64 48 | wrangler secret put INTERNAL_JWT_SECRET
```

**After:**
```bash
# v1.13+ requires 64-byte minimum for HS512
npx flarelette-jwt-secret --len=64 | wrangler secret put INTERNAL_JWT_SECRET
```

---

## Migration Checklist

### For Existing HS512 Deployments

- [ ] Regenerate all HS512 secrets with 64-byte minimum
  ```bash
  npx flarelette-jwt-secret --len=64
  ```

- [ ] Update Cloudflare Workers secrets
  ```bash
  wrangler secret put JWT_SECRET --env production
  ```

- [ ] Remove conflicting mode configuration
  - Cannot have both `JWT_SECRET*` and `JWT_PUBLIC_JWK*`
  - Choose one mode per deployment

- [ ] Test startup (will fail if secrets too short)

- [ ] Update documentation references to use new commands

### For New Deployments

- [ ] Use `npx flarelette-jwt-secret --len=64` for all HS512 secrets
- [ ] Choose single mode (HS512 OR EdDSA OR RSA)
- [ ] Review security requirements in README

---

## Recommendations

### For Development
- ✅ HS512 is acceptable for dev/testing
- ✅ Generate secrets with `npx flarelette-jwt-secret --len=64`
- ✅ Store in `.env.local` (gitignored)

### For Production
- ✅ **Recommended**: EdDSA (Ed25519) for production
  - Asymmetric: services can't mint tokens
  - Key rotation via JWKS
  - Better security properties

- ⚠️ **Acceptable**: HS512 with proper controls
  - 64-byte minimum enforced
  - Rotate every 90 days
  - Mutual trust required (both sides can sign)

### For Gateway Pattern
- ✅ **Gateway**: Use `JWT_JWKS_URL` for external OIDC
- ✅ **Internal Services**: Use `JWT_JWKS_SERVICE_NAME` (service bindings)
- ✅ **Both use flarelette-hono**: Same middleware, different JWKS strategy

---

## Additional Resources

- [flarelette-jwt Security Guide](https://github.com/chrislyons-dev/flarelette-jwt-kit/blob/main/docs/security-guide.md)
- [flarelette-jwt Core Concepts](https://github.com/chrislyons-dev/flarelette-jwt-kit/blob/main/docs/core-concepts.md)
- [CVE-2015-2951: JWT `alg: none` vulnerability](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/)
- [CVE-2015-9235: JWT algorithm confusion](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/)

---

## Questions?

For security concerns or vulnerability reports, see:
- [flarelette-jwt Security Guide](https://github.com/chrislyons-dev/flarelette-jwt-kit/blob/main/docs/security-guide.md)
- [GitHub Issues](https://github.com/chrislyons-dev/flarelette-hono/issues)
