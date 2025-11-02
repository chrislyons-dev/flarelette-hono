# Input Validation

**Status**: Recommended Practice
**Last Updated**: 2025-11-02

---

## Security Boundary

**Input validation is a critical security boundary.**

JWT authentication verifies *who* is making the request. Input validation verifies *what* they're sending is safe and valid.

**Both are required.** Authentication without validation leaves your application vulnerable to:

- **Injection attacks** (SQL injection, command injection, XSS)
- **Type confusion** (sending string when number expected)
- **Business logic bypass** (negative quantities, dates in the past)
- **Resource exhaustion** (unbounded arrays, massive strings)
- **Data corruption** (invalid formats, constraint violations)

**Never trust input**, even from authenticated users.

---

## Recommended Approach: Zod

Use [Zod](https://zod.dev/) for runtime type validation with TypeScript integration.

### Why Zod?

| Benefit | Description |
|---------|-------------|
| **Type inference** | Schema automatically infers TypeScript types |
| **Runtime safety** | Validates actual request data at runtime |
| **Hono integration** | Native `@hono/zod-validator` middleware |
| **Composable** | Schemas are reusable and extensible |
| **Clear errors** | Detailed validation error messages |
| **Zero `any`** | Maintains strict type safety throughout |

---

## Installation

```bash
npm install zod @hono/zod-validator
# or
pnpm add zod @hono/zod-validator
```

---

## Basic Pattern

### 1. Define Schema

```typescript
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().positive().optional(),
})
```

### 2. Apply Validator Middleware

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

app.post(
  '/users',
  authGuard(policy().rolesAny('admin')),     // JWT auth + policy
  zValidator('json', createUserSchema),       // Validate request body
  async (c) => {
    const body = c.req.valid('json')          // Fully typed!
    // body is { email: string, name: string, age?: number }

    return c.json({ id: 'user-123', ...body })
  }
)
```

### 3. Handle Validation Errors

Zod automatically returns `400 Bad Request` with error details:

```json
{
  "success": false,
  "error": {
    "issues": [
      {
        "code": "invalid_string",
        "validation": "email",
        "path": ["email"],
        "message": "Invalid email"
      }
    ]
  }
}
```

---

## Common Patterns

### String Validation

```typescript
const stringSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric"),

  email: z.string().email("Invalid email format"),

  url: z.string().url("Invalid URL"),

  cusip: z.string().regex(
    /^[0-9A-Z]{9}$/,
    "CUSIP must be 9 alphanumeric characters"
  ),
})
```

### Numeric Validation

```typescript
const numericSchema = z.object({
  price: z.number()
    .positive("Price must be positive")
    .finite("Price must be finite"),

  quantity: z.number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(1000, "Quantity cannot exceed 1000"),

  couponRate: z.number()
    .min(0, "Coupon rate must be between 0 and 1")
    .max(1, "Coupon rate must be between 0 and 1"),
})
```

### Date Validation

```typescript
const dateSchema = z.object({
  // ISO 8601 string
  settlementDate: z.string().datetime(),

  // Or coerce to Date object
  maturityDate: z.coerce.date(),

  // Future dates only
  expirationDate: z.coerce.date().refine(
    (date) => date > new Date(),
    "Expiration date must be in the future"
  ),
})
```

### Enum Validation

```typescript
const enumSchema = z.object({
  frequency: z.enum(['1', '2', '4', '12'], {
    errorMap: () => ({ message: "Frequency must be 1, 2, 4, or 12" })
  }),

  // Or use native enum
  status: z.nativeEnum(Status),

  // Or literal union
  role: z.union([
    z.literal('admin'),
    z.literal('analyst'),
    z.literal('viewer'),
  ]),
})
```

### Array Validation

```typescript
const arraySchema = z.object({
  // Array with length constraints
  tags: z.array(z.string())
    .min(1, "At least one tag required")
    .max(10, "Maximum 10 tags allowed"),

  // Array of objects
  items: z.array(
    z.object({
      id: z.string(),
      quantity: z.number().int().positive(),
    })
  ).nonempty("Items array cannot be empty"),

  // Unique array
  cusips: z.array(z.string()).refine(
    (arr) => new Set(arr).size === arr.length,
    "CUSIPs must be unique"
  ),
})
```

### Nested Objects

```typescript
const nestedSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
  }),

  address: z.object({
    street: z.string(),
    city: z.string(),
    zipCode: z.string().regex(/^\d{5}$/),
  }).optional(),
})
```

### Optional vs Required

```typescript
const optionalSchema = z.object({
  // Required by default
  email: z.string().email(),

  // Explicitly optional (can be undefined)
  name: z.string().optional(),

  // Optional with default
  role: z.string().default('viewer'),

  // Nullable (can be null)
  middleName: z.string().nullable(),

  // Both nullable and optional
  suffix: z.string().nullable().optional(),
})
```

---

## Advanced Patterns

### Cross-Field Validation

```typescript
const crossFieldSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine(
  (data) => data.endDate > data.startDate,
  {
    message: "End date must be after start date",
    path: ["endDate"],
  }
)
```

### Conditional Validation

```typescript
const conditionalSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bond'),
    cusip: z.string().regex(/^[0-9A-Z]{9}$/),
    couponRate: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal('stock'),
    ticker: z.string().regex(/^[A-Z]{1,5}$/),
  }),
])
```

### Reusable Schemas

```typescript
// Base schemas
const emailSchema = z.string().email()
const cusipSchema = z.string().regex(/^[0-9A-Z]{9}$/)

// Composed schemas
const userSchema = z.object({
  email: emailSchema,
  name: z.string().min(1),
})

const bondSchema = z.object({
  cusip: cusipSchema,
  price: z.number().positive(),
})

// Extend existing schemas
const adminUserSchema = userSchema.extend({
  role: z.literal('admin'),
  permissions: z.array(z.string()),
})
```

### Transform Data

```typescript
const transformSchema = z.object({
  // Normalize email to lowercase
  email: z.string().email().transform((val) => val.toLowerCase()),

  // Parse comma-separated string to array
  tags: z.string().transform((val) => val.split(',')),

  // Convert cents to dollars
  priceInCents: z.number().transform((val) => val / 100),
})
```

---

## Query Parameters

Validate query strings with `zValidator('query', schema)`:

```typescript
const searchQuerySchema = z.object({
  q: z.string().min(1, "Query cannot be empty"),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(100).default(10)
  ),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(0).default(0)
  ).optional(),
})

app.get(
  '/search',
  authGuard(),
  zValidator('query', searchQuerySchema),
  async (c) => {
    const { q, limit, offset } = c.req.valid('query')
    // All typed correctly: q: string, limit: number, offset?: number

    return c.json({ results: [], query: q, limit, offset })
  }
)
```

---

## Combining Auth + Validation

**Order matters**: Place `authGuard` before `zValidator` to authenticate first.

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Schemas
const bondPriceSchema = z.object({
  cusip: z.string().regex(/^[0-9A-Z]{9}$/),
  settlementDate: z.string().datetime(),
  couponRate: z.number().min(0).max(1),
  frequency: z.enum(['1', '2', '4', '12']),
})

const analystPolicy = policy()
  .rolesAny('analyst', 'admin')
  .needAll('valuation:write')

// Route with auth + validation
app.post(
  '/valuation/price',
  authGuard(analystPolicy),              // 1. Verify JWT + policy
  zValidator('json', bondPriceSchema),   // 2. Validate request body
  async (c) => {
    const auth = c.get('auth')           // Authenticated user
    const body = c.req.valid('json')     // Validated input

    // Both auth and body are fully typed
    // auth.sub: string
    // body.cusip: string, body.couponRate: number, etc.

    return c.json({ price: 99.948 })
  }
)
```

---

## Custom Error Handling

Override default validation error responses:

```typescript
import { zValidator } from '@hono/zod-validator'

app.post(
  '/users',
  authGuard(),
  zValidator('json', createUserSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'validation_error',
          message: 'Invalid request body',
          details: result.error.flatten(),
        },
        400
      )
    }
  }),
  async (c) => {
    const body = c.req.valid('json')
    return c.json({ ok: true })
  }
)
```

---

## Security Best Practices

### 1. Validate Everything

**Every endpoint that accepts input must validate it.**

```typescript
// ❌ Bad - No validation
app.post('/calculate', authGuard(), async (c) => {
  const body = await c.req.json()
  // body is any - unsafe!
  return c.json({ result: body.value * 2 })
})

// ✅ Good - Validated input
const calcSchema = z.object({
  value: z.number().finite(),
})

app.post('/calculate',
  authGuard(),
  zValidator('json', calcSchema),
  async (c) => {
    const body = c.req.valid('json')
    // body is { value: number } - safe!
    return c.json({ result: body.value * 2 })
  }
)
```

### 2. Constrain String Lengths

Prevent resource exhaustion attacks:

```typescript
const safeStringSchema = z.object({
  // ❌ Bad - Unbounded string
  description: z.string(),

  // ✅ Good - Bounded string
  description: z.string().max(1000, "Description too long"),
})
```

### 3. Constrain Array Sizes

Prevent DoS via large arrays:

```typescript
const safeArraySchema = z.object({
  // ❌ Bad - Unbounded array
  items: z.array(z.string()),

  // ✅ Good - Bounded array
  items: z.array(z.string()).max(100, "Too many items"),
})
```

### 4. Validate Formats

Prevent injection attacks with strict format validation:

```typescript
const safeFormatSchema = z.object({
  // ❌ Bad - Any string
  cusip: z.string(),

  // ✅ Good - Strict format
  cusip: z.string().regex(/^[0-9A-Z]{9}$/, "Invalid CUSIP format"),
})
```

### 5. Reject Unknown Keys

Prevent parameter pollution:

```typescript
// By default, Zod strips unknown keys
const strictSchema = z.object({
  email: z.string().email(),
}).strict()  // Explicitly reject unknown keys

// Or allow them explicitly
const looseSchema = z.object({
  email: z.string().email(),
}).passthrough()  // Allow unknown keys
```

### 6. Sanitize Output

Never trust validated input for output without sanitization:

```typescript
app.post(
  '/users',
  authGuard(),
  zValidator('json', userSchema),
  async (c) => {
    const body = c.req.valid('json')

    // ✅ Store validated data
    const user = await db.createUser(body)

    // ✅ Return only safe fields
    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      // Don't echo back arbitrary input
    })
  }
)
```

---

## Testing Validation

Test both valid and invalid inputs:

```typescript
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

describe('Validation', () => {
  const app = new Hono()

  const schema = z.object({
    email: z.string().email(),
    age: z.number().int().positive(),
  })

  app.post('/users', zValidator('json', schema), (c) => {
    return c.json({ ok: true })
  })

  it('accepts valid input', async () => {
    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', age: 25 }),
    })

    expect(res.status).toBe(200)
  })

  it('rejects invalid email', async () => {
    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', age: 25 }),
    })

    expect(res.status).toBe(400)
  })

  it('rejects negative age', async () => {
    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', age: -5 }),
    })

    expect(res.status).toBe(400)
  })
})
```

---

## Alternative Libraries

While Zod is recommended, other validation libraries work with Hono:

| Library | Pros | Cons |
|---------|------|------|
| **[Zod](https://zod.dev/)** | Best TypeScript integration, composable | Slightly larger bundle |
| **[Valibot](https://valibot.dev/)** | Smallest bundle size | Less mature ecosystem |
| **[Yup](https://github.com/jquense/yup)** | Mature, well-known | No built-in TS inference |
| **[ArkType](https://arktype.io/)** | Fastest runtime performance | Newer, less documentation |

**Recommendation**: Use Zod unless bundle size is critical (then consider Valibot).

---

## Summary

**Input validation is not optional.** It's a critical security boundary that protects your application from malicious or malformed data.

### Key Principles

1. **Validate all input** - Body, query params, headers, path params
2. **Use Zod** - Type-safe, composable, Hono-native
3. **Constrain everything** - String lengths, array sizes, numeric ranges
4. **Fail explicitly** - Return 400 with clear error messages
5. **Combine with auth** - Authentication verifies *who*, validation verifies *what*

### Recommended Pattern

```typescript
// 1. Define schema
const schema = z.object({ /* ... */ })

// 2. Apply middleware (auth before validation)
app.post('/resource',
  authGuard(policy),           // JWT verification + policy
  zValidator('json', schema),  // Input validation
  async (c) => {
    const auth = c.get('auth')       // Authenticated user (typed)
    const body = c.req.valid('json') // Validated input (typed)

    // Both are safe to use
    return c.json({ ok: true })
  }
)
```

**Never trust input**, even from authenticated users. Validate everything.

---

## References

- [Zod Documentation](https://zod.dev/)
- [Hono Validation Guide](https://hono.dev/guides/validation)
- [@hono/zod-validator](https://github.com/honojs/middleware/tree/main/packages/zod-validator)
- [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
