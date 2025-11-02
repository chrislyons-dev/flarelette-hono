# Pull Request

## Description

<!-- Provide a concise description of the changes in this PR -->

## Conventional Commit Type

<!--
This project uses Conventional Commits for automated releases.
Your PR title should follow this format: <type>(<scope>): <description>

Examples:
  - feat: add structured logging helper
  - fix(middleware): handle null tokens correctly
  - docs: update authentication guide
  - chore: update dependencies

Common types:
  - feat: New feature (triggers minor version bump)
  - fix: Bug fix (triggers patch version bump)
  - feat!: Breaking change (triggers major version bump)
  - docs: Documentation only
  - chore: Maintenance (no version bump)
  - refactor: Code refactoring (no version bump)
  - test: Test improvements (no version bump)
  - perf: Performance improvement (triggers patch)
-->

## Type of Change

<!-- Mark the relevant option with an 'x' -->

- [ ] Bug fix (fix: non-breaking change which fixes an issue)
- [ ] New feature (feat: non-breaking change which adds functionality)
- [ ] Breaking change (feat!: or fix!: would cause existing functionality to not work as expected)
- [ ] Documentation update (docs:)
- [ ] Code refactoring (refactor:)
- [ ] Performance improvement (perf:)
- [ ] Test coverage improvement (test:)
- [ ] Dependency update (chore:)

## Checklist

<!-- Mark completed items with an 'x' -->

### Code Quality

- [ ] Code follows the project's style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex or non-obvious code
- [ ] No `any` types introduced (100% type safety maintained)
- [ ] All strict TypeScript checks pass

### Testing

- [ ] New tests added for new features/fixes
- [ ] All existing tests pass
- [ ] Test coverage maintained at 95%+
- [ ] Integration tests updated if needed

### Security

- [ ] No secrets committed to version control
- [ ] Input validation added for new endpoints
- [ ] Security implications documented
- [ ] No known vulnerabilities introduced

### Documentation

- [ ] README updated if needed
- [ ] API documentation updated
- [ ] Architecture docs updated if design changed
- [ ] MkDocs content updated
- [ ] CHANGELOG.md updated

### Build & CI

- [ ] `npm run check` passes locally
- [ ] TypeScript compilation successful
- [ ] Linting passes
- [ ] Formatting passes
- [ ] All CI checks pass

## Breaking Changes

<!-- If this PR introduces breaking changes, describe them here and provide migration guidance -->

N/A

## Related Issues

<!-- Link to related issues using #issue-number -->

Closes #

## Additional Context

<!-- Add any additional context, screenshots, or information that might be helpful for reviewers -->
