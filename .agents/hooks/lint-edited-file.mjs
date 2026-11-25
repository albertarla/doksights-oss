#!/usr/bin/env node
// Antigravity PostToolUse adapter that translates stdin/stdout and delegates to .claude/hooks/lint-edited-file.mjs.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const projectDir = input.workspacePaths?.[0] || path.resolve(import.meta.dirname, "../..");
const claudeHook = path.join(projectDir, ".claude", "hooks", "lint-edited-file.mjs");

const res = spawnSync(process.execPath, [claudeHook], {
  input: JSON.stringify({
    cwd: projectDir,
    tool_input: { file_path: input.toolCall?.args?.TargetFile },
  }),
  encoding: "utf8",
  env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
});

if (res.stderr) process.stderr.write(res.stderr);
if (res.status === 0) process.stdout.write("{}\n");
process.exit(res.status ?? 0);
