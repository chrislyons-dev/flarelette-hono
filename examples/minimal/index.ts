/**
 * Minimal example - Basic JWT authentication
 *
 * Demonstrates the simplest possible usage of flarelette-hono.
 * Uses HS512 with a shared secret for authentication only.
 */

import { Hono } from 'hono'
import { authGuard } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// Public route (no authentication)
app.get('/', (c) => {
  return c.json({
    message: 'Public endpoint - no authentication required',
  })
})

// Protected route (authentication required)
app.get('/protected', authGuard(), (c) => {
  const auth = c.get('auth')
  return c.json({
    message: 'Authenticated endpoint',
    user: {
      sub: auth.sub,
      email: auth.email,
      name: auth.name,
    },
  })
})

export default app
