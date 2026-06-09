# Contributing

Thank you for your interest in contributing. This repository follows a spec-first, test-first workflow: behavior is agreed on before tests are written, and tests are agreed on before implementation begins.

## Workflow

1. **Spec**: every substantive change starts from a written description of the intended behavior - an issue or a design note. Wire-format changes must describe the exact bytes on the wire; a second implementation in another language must be able to interoperate from the spec alone.
2. **Tests**: tests are written against the spec before the implementation. Golden fixtures pin wire formats. Tests describe behavior, not implementation details.
3. **Implementation**: code is written to make the reviewed tests pass.
4. **Review**: every PR is reviewed before merge. CI must be green: install, audit, lint, format check, typecheck, tests, build.

## Toolchain

| Purpose | Tool |
|---|---|
| Runtime | Node 22 LTS, pinned via Volta |
| Package manager | pnpm (workspaces) |
| Modules | ESM only (`"type": "module"`) |
| Lint | `oxlint` |
| Format | `oxfmt` |
| Tests | `vitest`, colocated `*.test.ts` |
| Types | `tsc --noEmit`, strict mode plus the strictness flags in `tsconfig.base.json` |
| Git hooks | `prek` (pre-commit compatible) |

## Setup

```bash
volta install node@22 pnpm
pnpm install
prek install
```

Before committing:

```bash
prek run
pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test
```

## Standards

- Zero warnings across lint, typecheck, and tests. If a warning truly cannot be fixed, add an inline ignore with a justification comment.
- Pin exact dependency versions (no `^` or `~`). Justify every new dependency in the PR description.
- Functions stay under 100 lines and cyclomatic complexity 8; lines under 100 characters.
- Public APIs carry docstrings with `@param`, `@returns`, and `@throws`.
- Commits: imperative mood, 72-character subject limit, one logical change per commit. Never force-push shared branches.
- No secrets, keys, or credentials in the repository.

## Security

If you find a vulnerability, do not open a public issue. Contact the maintainers privately.
