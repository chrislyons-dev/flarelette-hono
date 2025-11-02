/**
 * Policy builder for declarative JWT authorization
 *
 * Provides fluent API for constructing authorization policies based on JWT claims.
 *
 * @module policy-builder
 * @uses types policy types
 *
 */

import type { JwtPayload } from '@chrislyons-dev/flarelette-jwt'
import type { Policy, PolicyBuilder, PolicyResult } from './types.js'

/**
 * Policy rule types for internal representation
 */
type RoleRule = { type: 'rolesAny' | 'rolesAll'; roles: string[] }
type PermissionRule = { type: 'needAny' | 'needAll'; permissions: string[] }
type PolicyRule = RoleRule | PermissionRule

/**
 * Concrete policy implementation
 *
 * Evaluates rules against JWT payload to determine access.
 */
class PolicyImpl implements Policy {
  constructor(private readonly rules: readonly PolicyRule[]) {}

  evaluate(payload: JwtPayload): PolicyResult {
    // Empty policy always succeeds (authentication-only guard)
    if (this.rules.length === 0) {
      return { success: true }
    }

    // Evaluate all rules - all must pass
    for (const rule of this.rules) {
      const result = this.evaluateRule(rule, payload)
      if (!result.success) {
        return result
      }
    }

    return { success: true }
  }

  private evaluateRule(rule: PolicyRule, payload: JwtPayload): PolicyResult {
    switch (rule.type) {
      case 'rolesAny':
        return this.evaluateRolesAny(rule.roles, payload)
      case 'rolesAll':
        return this.evaluateRolesAll(rule.roles, payload)
      case 'needAny':
        return this.evaluateNeedAny(rule.permissions, payload)
      case 'needAll':
        return this.evaluateNeedAll(rule.permissions, payload)
    }
  }

  private evaluateRolesAny(required: string[], payload: JwtPayload): PolicyResult {
    const roles = payload.roles
    if (!Array.isArray(roles) || roles.length === 0) {
      return {
        success: false,
        reason: `Missing required roles: at least one of [${required.join(', ')}]`,
      }
    }

    const hasRole = required.some((role) => roles.includes(role))
    if (!hasRole) {
      return {
        success: false,
        reason: `Missing required roles: at least one of [${required.join(', ')}]`,
      }
    }

    return { success: true }
  }

  private evaluateRolesAll(required: string[], payload: JwtPayload): PolicyResult {
    const roles = payload.roles
    if (!Array.isArray(roles) || roles.length === 0) {
      return {
        success: false,
        reason: `Missing required roles: all of [${required.join(', ')}]`,
      }
    }

    const missingRoles = required.filter((role) => !roles.includes(role))
    if (missingRoles.length > 0) {
      return {
        success: false,
        reason: `Missing required roles: all of [${required.join(', ')}]`,
      }
    }

    return { success: true }
  }

  private evaluateNeedAny(required: string[], payload: JwtPayload): PolicyResult {
    const permissions = payload.permissions
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return {
        success: false,
        reason: `Missing required permissions: at least one of [${required.join(', ')}]`,
      }
    }

    const hasPermission = required.some((perm) => permissions.includes(perm))
    if (!hasPermission) {
      return {
        success: false,
        reason: `Missing required permissions: at least one of [${required.join(', ')}]`,
      }
    }

    return { success: true }
  }

  private evaluateNeedAll(required: string[], payload: JwtPayload): PolicyResult {
    const permissions = payload.permissions
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return {
        success: false,
        reason: `Missing required permissions: all of [${required.join(', ')}]`,
      }
    }

    const missingPermissions = required.filter((perm) => !permissions.includes(perm))
    if (missingPermissions.length > 0) {
      return {
        success: false,
        reason: `Missing required permissions: all of [${required.join(', ')}]`,
      }
    }

    return { success: true }
  }
}

/**
 * Policy builder implementation
 *
 * Fluent API for constructing authorization policies.
 */
class PolicyBuilderImpl implements PolicyBuilder {
  private rules: PolicyRule[] = []

  rolesAny(...roles: string[]): PolicyBuilder {
    if (roles.length === 0) {
      throw new Error('rolesAny requires at least one role')
    }
    this.rules.push({ type: 'rolesAny', roles })
    return this
  }

  rolesAll(...roles: string[]): PolicyBuilder {
    if (roles.length === 0) {
      throw new Error('rolesAll requires at least one role')
    }
    this.rules.push({ type: 'rolesAll', roles })
    return this
  }

  needAny(...permissions: string[]): PolicyBuilder {
    if (permissions.length === 0) {
      throw new Error('needAny requires at least one permission')
    }
    this.rules.push({ type: 'needAny', permissions })
    return this
  }

  needAll(...permissions: string[]): PolicyBuilder {
    if (permissions.length === 0) {
      throw new Error('needAll requires at least one permission')
    }
    this.rules.push({ type: 'needAll', permissions })
    return this
  }

  build(): Policy {
    // Return immutable policy with frozen rules
    return new PolicyImpl(Object.freeze([...this.rules]))
  }
}

/**
 * Create a new policy builder
 *
 * @returns PolicyBuilder instance for fluent API construction
 *
 * @example
 * ```typescript
 * const adminPolicy = policy()
 *   .rolesAny('admin', 'superuser')
 *   .needAll('write:users', 'delete:users')
 *   .build()
 * ```
 */
export function policy(): PolicyBuilder {
  return new PolicyBuilderImpl()
}
