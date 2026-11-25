@[CLAUDE.md](CLAUDE.md)

@[ADR Index](docs/adr/_index.md)

## Antigravity-Specific Rules

- **Never modify `CLAUDE.md` or anything inside `.claude/`** unless the user explicitly asks you to. Treat `CLAUDE.md` and `.claude/` as read-only sources of truth.
- Skills, agents, rules and the lint hook live in `.claude/`; the files in `.agents/` only point to them.
