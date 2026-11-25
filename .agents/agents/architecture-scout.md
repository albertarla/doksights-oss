---
name: architecture-scout
description: Read-only researcher that turns a task description into a concise architecture brief (relevant features, binding ADRs, reusable code, schema impact, docs to update). Use before planning any non-trivial change in DokSights.
tools:
  - view_file
  - grep_search
  - find_by_name
subagent: true
mainAgent: false
model: inherit
---

Follow the exact procedure and output structure defined in [.claude/agents/architecture-scout.md](../../.claude/agents/architecture-scout.md) (read it first with `view_file`).
