/**
 * Authenticated example - Full authentication and authorization
 *
 * Demonstrates complete usage of flarelette-hono including:
 * - Authentication with authGuard
 * - Authorization with policy builder
 * - Role-based access control (RBAC)
 * - Permission-based access control
 * - Multi-tenant data isolation
 */

import { Hono } from 'hono'
import { authGuard, policy } from '@chrislyons-dev/flarelette-hono'
import type { HonoEnv } from '@chrislyons-dev/flarelette-hono'

const app = new Hono<HonoEnv>()

// ==================== Public Routes ====================

app.get('/', (c) => {
  return c.json({
    message: 'API is running',
    version: '1.0.0',
  })
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy' })
})

// ==================== Authenticated Routes ====================

// User profile - authentication only
app.get('/profile', authGuard(), (c) => {
  const auth = c.get('auth')
  return c.json({
    id: auth.sub,
    email: auth.email,
    name: auth.name,
    organization: auth.org_id,
  })
})

// User settings - authentication only
app.get('/settings', authGuard(), (c) => {
  const auth = c.get('auth')
  return c.json({
    userId: auth.sub,
    preferences: {
      theme: 'dark',
      language: 'en',
    },
  })
})

// ==================== Role-Based Access Control ====================

// Admin dashboard - requires admin or superuser role
const adminPolicy = policy().rolesAny('admin', 'superuser').build()

app.get('/admin/dashboard', authGuard(adminPolicy), (c) => {
  return c.json({
    message: 'Admin dashboard',
    stats: {
      users: 1234,
      revenue: 56789,
    },
  })
})

app.get('/admin/users', authGuard(adminPolicy), (c) => {
  return c.json({
    users: [
      { id: 'user-1', email: 'user1@example.com' },
      { id: 'user-2', email: 'user2@example.com' },
    ],
  })
})

// Analytics - requires analyst or admin role
const analystPolicy = policy().rolesAny('analyst', 'admin').build()

app.get('/analytics', authGuard(analystPolicy), (c) => {
  return c.json({
    report: 'Monthly Analytics',
    data: [
      { date: '2024-01', value: 100 },
      { date: '2024-02', value: 150 },
    ],
  })
})

// ==================== Permission-Based Access Control ====================

// Read data - requires read permission
const readPolicy = policy().needAny('read:data', 'read:all').build()

app.get('/data', authGuard(readPolicy), (c) => {
  return c.json({
    data: [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ],
  })
})

// Write data - requires write permission
const writePolicy = policy().needAll('write:data').build()

app.post('/data', authGuard(writePolicy), async (c) => {
  const body = await c.req.json()
  return c.json({
    created: true,
    item: body,
  })
})

// Delete data - requires both admin role and delete permission
const deletePolicy = policy()
  .rolesAny('admin', 'superuser')
  .needAll('delete:data')
  .build()

app.delete('/data/:id', authGuard(deletePolicy), (c) => {
  const id = c.req.param('id')
  return c.json({
    deleted: true,
    id,
  })
})

// ==================== Complex Policies ====================

// Reports - requires analyst role AND read permissions
const reportsPolicy = policy()
  .rolesAny('analyst', 'admin')
  .needAny('read:reports', 'read:all')
  .build()

app.get('/reports', authGuard(reportsPolicy), (c) => {
  return c.json({
    reports: [
      { id: 'report-1', title: 'Q1 Report' },
      { id: 'report-2', title: 'Q2 Report' },
    ],
  })
})

// Export data - requires verified role AND export permission
const exportPolicy = policy()
  .rolesAll('verified', 'approved')
  .needAll('export:data')
  .build()

app.get('/export', authGuard(exportPolicy), (c) => {
  const auth = c.get('auth')
  return c.json({
    message: 'Export initiated',
    exportedBy: auth.sub,
    timestamp: new Date().toISOString(),
  })
})

// ==================== Multi-Tenant Data Isolation ====================

// Organization-specific data - checks org_id from JWT
app.get('/orgs/:orgId/data', authGuard(), (c) => {
  const auth = c.get('auth')
  const requestedOrgId = c.req.param('orgId')

  // Enforce tenant isolation
  if (auth.org_id !== requestedOrgId) {
    return c.json(
      {
        error: 'forbidden',
        message: 'Cannot access data from different organization',
      },
      403
    )
  }

  return c.json({
    orgId: requestedOrgId,
    data: [
      { id: 1, name: 'Org-specific item 1' },
      { id: 2, name: 'Org-specific item 2' },
    ],
  })
})

// ==================== Delegated Access (RFC 8693) ====================

// Service endpoint - accepts delegated tokens
app.get('/internal/process', authGuard(), (c) => {
  const auth = c.get('auth')

  // Check if this is a delegated token
  if (auth.act) {
    return c.json({
      message: 'Processing on behalf of user',
      user: auth.sub,
      service: auth.act.sub,
      serviceIssuer: auth.act.iss,
    })
  }

  return c.json({
    message: 'Direct user access',
    user: auth.sub,
  })
})

export default app
