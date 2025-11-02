# Minimal Example

Basic JWT authentication with flarelette-hono.

## Overview

This example demonstrates the simplest possible usage:
- HS512 symmetric signing with shared secret
- Public and authenticated routes
- No authorization policies (authentication only)

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

3. Configure the secret as a Cloudflare Workers secret:
```bash
npx wrangler secret put JWT_SECRET
```
Paste the generated secret when prompted.

4. Update `wrangler.toml` with your issuer and audience.

## Run Locally

```bash
npx wrangler dev
```

## Test

Public endpoint (no authentication):
```bash
curl http://localhost:8787/
```

Protected endpoint (requires valid JWT):
```bash
# First, get a token from your authentication service
# Then:
curl http://localhost:8787/protected \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Deploy

```bash
npx wrangler deploy
```

## Security Notes

- **Never commit secrets** - Use Cloudflare Workers Secrets
- **Rotate secrets regularly** - Recommend 90-day rotation
- **Use short TTL** - 5-15 minutes recommended for production
- **Consider EdDSA** - For production, use EdDSA instead of HS512 for better security
