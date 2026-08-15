---
name: subtrack-commit
description: When committing changes to subtrack, creating PRs, or pushing to remote
---

# Subtrack Commit Guidelines

## When to Use

- When committing files in the subtrack repository
- When pushing to remote
- When creating a pull request

## Basic Rules

- **English only**: No Japanese in commits
- **1 commit = 1 logical change**: Do not mix multiple different changes
- **Meaningful granularity**: Split large changes
- **Refer to AGENTS.md**: Follow `apps/subtrack/AGENTS.md` for project conventions
- **Run tests before committing**: `pnpm test` to verify changes

## Branch Strategy

- **Working branch**: Always use `AI-agent`
- **PR target**: Merge `AI-agent` → `main`
- **Branch creation**: If `AI-agent` doesn't exist, create it first (`git checkout -b AI-agent`)

## Commit Message Format

```
<type>: <summary>
```

### Type List

| type       | usage                    |
| ---------- | ------------------------ |
| `feat`     | New feature              |
| `fix`      | Bug fix                  |
| `refactor` | Refactoring              |
| `docs`     | Documentation change     |
| `chore`    | Build/config change      |
| `style`    | Formatting/style change  |
| `perf`     | Performance improvement  |
| `test`     | Adding or fixing tests   |

### Working Commit (AI-agent branch only)

During development on `AI-agent` branch, use `edit` for temporary working commits:

```
edit
```

These are squash-merged into a proper conventional commit when merging to `main`.

### Examples

```
feat: add backup command
fix: restrict app-ci to subtrack only
refactor: replace custom table rendering with cli-table3
chore: update dependencies
docs: add usage examples to README
test: add unit tests for db module
```

## Commit Workflow

1. **Work on `AI-agent` branch**: Always develop on `AI-agent`
2. **Working commits**: Use `edit` for intermediate saves
3. **Before merge**: Squash working commits into proper conventional commit(s)
4. **Merge to `main`**: Via pull request (squash merge recommended)

## PR Creation

- Use squash merge when merging `AI-agent` → `main`
- PR title should be a proper conventional commit message
- Include summary of changes in PR body
- Reference related issues if any

## Notes

- Run `git status` before committing to confirm changes
- Run `pnpm test` to ensure all tests pass
- Run `pnpm build` to verify build succeeds after changes
- Never use `--force` variants before creating a PR
- Auto-generated files (dist/, etc.) should not be committed
