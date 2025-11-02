# Contributing to Flarelette-Hono

Thank you for your interest in contributing to Flarelette-Hono! This document provides guidelines and instructions for contributing.

---

## Code of Conduct

- Be respectful and professional
- Focus on constructive feedback
- Security issues: report privately (see Security section below)
- No personal attacks or harassment

---

## Development Setup

### Prerequisites

- Node.js 18+ or Bun 1.0+
- pnpm (recommended) or npm
- Cloudflare account (for testing)
- Git

### Initial Setup

```bash
# Clone repository
git clone https://github.com/chrislyons-dev/flarelette-hono.git
cd flarelette-hono

# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### Project Structure

```
flarelette-hono/
├── src/
│   ├── index.ts              # Public API exports
│   ├── authGuard.ts          # Authentication middleware
│   ├── policy.ts             # Policy builder
│   ├── types.ts              # Type definitions
│   └── errors.ts             # Error classes
├── tests/
│   ├── authGuard.test.ts     # Middleware tests
│   ├── policy.test.ts        # Policy builder tests
│   └── fixtures/             # Test utilities
├── docs/                     # Documentation
├── examples/                 # Usage examples
└── package.json
```

---

## Code Style Guidelines

### TypeScript Standards

**Strict Mode Required:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**Never Use `any`:**

```typescript
// ❌ Bad
function process(data: any): any {
  return data
}

// ✅ Good
function process(data: unknown): AuthContext {
  if (!isAuthContext(data)) {
    throw new TypeError('Invalid data')
  }
  return data
}

function isAuthContext(value: unknown): value is AuthContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    'iss' in value &&
    typeof value.iss === 'string'
  )
}
```

**Use Type Guards:**

```typescript
// ✅ Good: Type narrowing with validation
function extractToken(header: string | undefined): string | null {
  if (typeof header !== 'string') {
    return null
  }

  if (!header.startsWith('Bearer ')) {
    return null
  }

  return header.substring(7)
}
```

**Use Discriminated Unions for Errors:**

```typescript
// ✅ Good: Type-safe error handling
type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E }

async function verify(token: string): Promise<Result<AuthContext, string>> {
  try {
    const payload = await jwtVerify(token)
    return { success: true, value: payload }
  } catch (error) {
    return { success: false, error: 'Invalid token' }
  }
}
```

### Naming Conventions

- **Variables/Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Private fields**: `_prefixed` (if needed)

```typescript
// ✅ Good
interface AuthContext { }
const MAX_TTL_SECONDS = 900
function verifyToken(token: string): Promise<AuthContext | null>
```

### Code Organization

**Imports:**
```typescript
// 1. External dependencies
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'

// 2. Internal dependencies
import { policy } from './policy'
import type { Policy, AuthContext } from './types'

// 3. Relative imports
import { extractToken } from './utils'
```

**Exports:**
```typescript
// Prefer named exports
export { authGuard } from './authGuard'
export { policy } from './policy'
export type { AuthContext, Policy, HonoEnv } from './types'

// Avoid default exports (except for Hono apps)
```

### Comments and Documentation

**TSDoc for Public API:**
```typescript
/**
 * Hono middleware for JWT authentication and policy enforcement.
 *
 * Extracts Bearer token from Authorization header, verifies it using
 * @chrislyons-dev/flarelette-jwt, and enforces optional policy.
 *
 * @param policy - Optional policy to enforce after authentication
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * const adminPolicy = policy().rolesAny('admin')
 * app.get('/admin', authGuard(adminPolicy), handler)
 * ```
 */
export function authGuard(policy?: Policy): MiddlewareHandler<HonoEnv>
```

**Inline Comments:**
```typescript
// ✅ Good: Explain "why", not "what"
// Use constant-time comparison to prevent timing attacks
if (!crypto.timingSafeEqual(a, b)) {
  return false
}

// ❌ Bad: Obvious "what"
// Check if a equals b
if (a !== b) {
  return false
}
```

---

## Testing Requirements

### Coverage Requirements

- **Minimum**: 90% line coverage
- **Target**: 95%+ line coverage
- **Critical paths**: 100% coverage (auth, policy evaluation)

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest'

describe('authGuard', () => {
  describe('token extraction', () => {
    it('extracts valid Bearer token', async () => {
      // Arrange
      const token = 'eyJhbGc...'

      // Act
      const result = extractToken(`Bearer ${token}`)

      // Assert
      expect(result).toBe(token)
    })

    it('returns null for missing token', () => {
      expect(extractToken(undefined)).toBeNull()
    })

    it('returns null for malformed token', () => {
      expect(extractToken('Basic xyz')).toBeNull()
    })
  })

  describe('verification', () => {
    // ... more tests
  })
})
```

### Test Best Practices

1. **One assertion per test** (generally)
2. **Clear test names** (what, when, expected)
3. **Arrange-Act-Assert pattern**
4. **No test interdependencies**
5. **Mock external dependencies**

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Type check
pnpm typecheck
```

---

## Security Guidelines

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Instead, email: security@chrislyons.dev

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Best Practices

1. **Never log tokens or secrets**
   ```typescript
   // ❌ Bad
   console.log({ token: authHeader })

   // ✅ Good
   console.log({ hasToken: !!authHeader })
   ```

2. **Fail securely**
   ```typescript
   // ✅ Good: Generic error message
   return c.json({ error: 'unauthorized' }, 401)

   // ❌ Bad: Leaks information
   return c.json({ error: 'Token expired at 2025-11-01T12:00:00Z' }, 401)
   ```

3. **Validate all inputs**
   ```typescript
   // ✅ Good: Type guard validation
   if (!isValidPolicy(policy)) {
     throw new TypeError('Invalid policy structure')
   }
   ```

4. **Use constant-time comparisons**
   ```typescript
   // ✅ Good: Use crypto.timingSafeEqual for secrets
   if (!crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))) {
     return false
   }

   // ❌ Bad: Timing attack vulnerability
   if (a !== b) {
     return false
   }
   ```

---

## Commit Guidelines

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(auth): add role-based authorization

Implement rolesAny() and rolesAll() methods in policy builder.
Includes tests and documentation.

Closes #123

---

fix(authGuard): handle missing Authorization header

Previously threw error, now returns 401 as expected.

---

docs(jwt): clarify JWKS caching behavior

Add note about 5-minute cache TTL and automatic refresh.
```

### Commit Best Practices

1. **Atomic commits**: One logical change per commit
2. **Clear messages**: Describe what and why, not how
3. **Reference issues**: Use `Closes #123` or `Fixes #456`
4. **Sign commits**: Use GPG signing (optional but recommended)

---

## Pull Request Process

### Before Submitting

1. **Create a branch**
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make changes**
   - Follow code style guidelines
   - Add tests
   - Update documentation

3. **Run checks**
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

4. **Commit changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

5. **Push branch**
   ```bash
   git push origin feat/my-feature
   ```

### Pull Request Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Added tests
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Linting passes

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-reviewed code
- [ ] Commented complex logic
- [ ] Updated documentation
- [ ] No breaking changes (or documented)
- [ ] Security implications considered
```

### Review Process

1. **Automated checks must pass**
   - TypeScript compilation
   - Linting (no errors)
   - Tests (90%+ coverage)
   - Security scan

2. **Code review**
   - At least one approving review required
   - Address all comments
   - Resolve conversations

3. **Merge**
   - Squash and merge (default)
   - Use conventional commit message
   - Delete branch after merge

---

## Release Process

**Releases are fully automated using [release-please](https://github.com/googleapis/release-please).**

### Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes (`feat!:` or `fix!:` commits)
- **MINOR**: New features (`feat:` commits)
- **PATCH**: Bug fixes (`fix:` or `perf:` commits)

### How Releases Work

1. **Merge PRs to main** with conventional commit messages
2. **Release-please creates a release PR** automatically
   - Updates version in `package.json`
   - Updates `CHANGELOG.md` with all changes since last release
   - Groups changes by type (Features, Bug Fixes, etc.)
3. **Review and merge the release PR**
4. **Release-please automatically:**
   - Creates a GitHub release with release notes
   - Publishes to NPM
   - Publishes to GitHub Packages
   - Tags the release

### Manual Release (Maintainers Only)

If you need to trigger a release manually:

1. Ensure all commits follow conventional commit format
2. Merge all ready PRs to `main`
3. Wait for release-please to create a release PR
4. Review the generated CHANGELOG and version bump
5. Merge the release PR
6. CI automatically publishes to NPM

### What Gets Included in Releases

Release-please determines version bumps based on commit types:

| Commit Type | Version Bump | Example |
|-------------|--------------|---------|
| `feat!:` | Major | `feat!: remove deprecated API` |
| `fix!:` | Major | `fix!: change response format` |
| `feat:` | Minor | `feat: add logging helper` |
| `fix:` | Patch | `fix: handle null tokens` |
| `perf:` | Patch | `perf: optimize verification` |
| `docs:` | None | `docs: update README` |
| `chore:` | None | `chore: update dependencies` |
| `refactor:` | None | `refactor: simplify middleware` |
| `test:` | None | `test: add edge cases` |

---

## Documentation Standards

### API Documentation

- **TSDoc comments** for all public functions
- **Examples** for complex APIs
- **Type definitions** inline
- **Links** to related documentation

### README

- **Clear description** of what the project does
- **Quick start** example (5-10 lines)
- **Installation** instructions
- **Configuration** guide
- **Links** to detailed docs

### Guides

- **Target audience**: Software architects and engineers
- **Voice**: Plain, conversational tone
- **Clarity**: 3-7 bullets or ≤120 words per section
- **Focus**: Explain intent, not implementation details
- **Format**: Markdown with headings, lists, tables

---

## Getting Help

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/chrislyons-dev/flarelette-hono/issues)
- **Discussions**: [GitHub Discussions](https://github.com/chrislyons-dev/flarelette-hono/discussions)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Flarelette-Hono!**
