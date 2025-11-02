# Installation

## Prerequisites

- **Node.js**: 18+ required
- **Package manager**: npm or pnpm
- **Hono**: 4.0+ required

## Core Dependencies

Install the core dependencies:

```bash
npm install hono @chrislyons-dev/flarelette-jwt @chrislyons-dev/flarelette-hono
```

Or with pnpm:

```bash
pnpm add hono @chrislyons-dev/flarelette-jwt @chrislyons-dev/flarelette-hono
```

## Optional Dependencies

### Input Validation (Strongly Recommended)

For type-safe runtime validation:

```bash
npm install zod @hono/zod-validator
```

See [Input Validation Guide](../guides/validation.md) for usage.

### Structured Logging (Recommended for Production)

For ADR-0013 compliant structured logging:

```bash
npm install hono-pino pino
```

See [Structured Logging Guide](../guides/logging.md) for usage.

## Verification

Verify the installation:

```bash
npm list @chrislyons-dev/flarelette-hono
```

You should see the installed version.

## Next Steps

- [Quick Start](quick-start.md) - Build your first authenticated endpoint
- [Configuration](configuration.md) - Set up environment variables and secrets
