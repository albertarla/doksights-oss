# ADR-001: Folder-Based Feature Documentation

> **Rule of thumb:** One file per feature in `docs/functionalities/`, listed in `_index.md`; read only the feature files a task touches.

**Date:** 2026-03-07 | **Status:** Accepted

**Context:** A single `functionalities.md` file does not scale beyond a handful of features; it causes merge conflicts and requires loading all context for every update.

**Decision:** Use a `docs/functionalities/` folder with one file per feature and a lightweight `_index.md` manifest.

**Consequences:** Each feature file is small and focused. AI agents can load only what they need.
