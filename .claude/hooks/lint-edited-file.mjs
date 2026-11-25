#!/usr/bin/env node
// PostToolUse hook (Edit|Write|MultiEdit): lint the frontend file Claude just changed and feed problems back.
// Exit 2 shows the output to Claude so it fixes it in the same turn; exit 0 = clean or nothing to check.
// Runs ESLint with --max-warnings 0, so every touched file loses its legacy `any`s too.
// Fast, single-file feedback only: scripts/run-all-checks is still the Definition-of-Done gate.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_OUTPUT = 4000;
const ESLINT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Path inside frontend/ to lint, or undefined when the file needs no check. */
export function frontendTarget(relativePath) {
  if (!relativePath.startsWith("frontend/")) return undefined;
  const inner = relativePath.slice("frontend/".length);
  if (inner.startsWith("node_modules/") || inner.startsWith("dist/") || inner.startsWith("coverage/")) return undefined;
  return ESLINT_EXTENSIONS.has(path.extname(inner).toLowerCase()) ? inner : undefined;
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function main() {
  const input = readStdin();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const filePath = input.tool_input?.file_path;
  if (!filePath || !fs.existsSync(filePath)) return 0;

  const rel = path.relative(projectDir, path.resolve(filePath)).split(path.sep).join("/");
  if (rel.startsWith("..")) return 0;
  const target = frontendTarget(rel);
  if (!target) return 0;

  const frontendDir = path.join(projectDir, "frontend");
  const bin = path.join(frontendDir, "node_modules", "eslint", "bin", "eslint.js");
  if (!fs.existsSync(bin)) return 0; // dependencies not installed: nothing to run

  const res = spawnSync(process.execPath, [bin, "--max-warnings", "0", "--no-warn-ignored", target], {
    cwd: frontendDir,
    encoding: "utf8",
    timeout: 50_000,
  });
  if (res.error || res.status === 0) return 0;

  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  const shown = out.length > MAX_OUTPUT ? `${out.slice(0, MAX_OUTPUT)}\n… (truncated)` : out;
  process.stderr.write(`Lint problems in ${rel}, fix them before moving on:\n${shown}\n`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}
