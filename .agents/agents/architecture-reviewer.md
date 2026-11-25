---
name: architecture-reviewer
description: Read-only reviewer that checks the current uncommitted changes against DokSights' ADRs, path rules and security non-negotiables before the final quality gate. Use after implementing any non-trivial change.
tools:
  - view_file
  - grep_search
  - find_by_name
  - run_command
subagent: true
mainAgent: false
model: inherit
---

Follow the exact procedure and review checklist defined in [.claude/agents/architecture-reviewer.md](../../.claude/agents/architecture-reviewer.md) (read it first with `view_file`).
