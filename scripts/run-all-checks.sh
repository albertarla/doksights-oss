#!/usr/bin/env bash
# DokSights quality gate: the Definition of Done for every change.
# Same steps as CI. Run from anywhere: bash scripts/run-all-checks.sh
#
#   --list            print the step ids and exit
#   --only id,id      run only these steps (the result is PARTIAL)
#   --skip id,id      skip these steps (the result is PARTIAL)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STEPS=(secrets backend-tests frontend-lint frontend-typecheck frontend-tests frontend-build)

describe() {
  case "$1" in
    secrets)            echo "gitleaks: git history + non-ignored working tree" ;;
    backend-tests)      echo "pytest (backend/tests)" ;;
    frontend-lint)      echo "ESLint, 0 errors (warnings allowed)" ;;
    frontend-typecheck) echo "tsc --noEmit (app + node configs)" ;;
    frontend-tests)     echo "Vitest unit and component tests" ;;
    frontend-build)     echo "vite production build" ;;
  esac
}

run_step() {
  case "$1" in
    secrets)
      if ! command -v gitleaks >/dev/null 2>&1; then
        echo "gitleaks is not installed (https://github.com/gitleaks/gitleaks)"; return 2
      fi
      # History, then every tracked or new non-ignored file (a local, gitignored .env may hold keys).
      (cd "$ROOT" && gitleaks git . --config .gitleaks.toml --no-banner --redact --log-level warn         && git ls-files -z -co --exclude-standard | xargs -0 cat 2>/dev/null            | gitleaks stdin --config .gitleaks.toml --no-banner --redact --log-level warn) ;;
    backend-tests)      (cd "$ROOT/backend" && python -m pytest -q -p no:cacheprovider --tb=short) ;;
    frontend-lint)      (cd "$ROOT/frontend" && npx eslint . --quiet) ;;
    frontend-typecheck) (cd "$ROOT/frontend" && npm run --silent typecheck) ;;
    frontend-tests)     (cd "$ROOT/frontend" && npx vitest run --silent --reporter=dot) ;;
    frontend-build)     (cd "$ROOT/frontend" && npx vite build --logLevel error) ;;
  esac
}

ONLY="" SKIP="" PARTIAL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --list) for s in "${STEPS[@]}"; do printf '%-20s %s\n' "$s" "$(describe "$s")"; done; exit 0 ;;
    --only) ONLY=",$2,"; PARTIAL=1; shift ;;
    --skip) SKIP=",$2,"; PARTIAL=1; shift ;;
    *) echo "Unknown option: $1"; exit 64 ;;
  esac
  shift
done

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "frontend/node_modules is missing: run 'npm ci' in frontend/ first."; exit 1
fi

declare -a RESULTS
FAILED=0
for s in "${STEPS[@]}"; do
  if { [ -n "$ONLY" ] && [[ "$ONLY" != *",$s,"* ]]; } || [[ "$SKIP" == *",$s,"* ]]; then
    RESULTS+=("SKIP  $s"); continue
  fi
  echo; echo "==> $s: $(describe "$s")"
  start=$(date +%s)
  run_step "$s"; code=$?
  secs=$(( $(date +%s) - start ))
  if [ $code -eq 0 ]; then RESULTS+=("PASS  $s (${secs}s)")
  elif [ $code -eq 2 ] && [ "$s" = secrets ]; then RESULTS+=("SKIP  $s (gitleaks missing)"); PARTIAL=1
  else RESULTS+=("FAIL  $s (${secs}s)"); FAILED=1
  fi
done

echo; echo "================ Summary ================"
printf '%s\n' "${RESULTS[@]}"
if [ $FAILED -ne 0 ]; then echo "RESULT: FAILED"; exit 1
elif [ $PARTIAL -ne 0 ]; then echo "RESULT: PARTIAL (some steps did not run: this is not the full gate)"; exit 3
else echo "RESULT: ALL CHECKS PASSED"; fi
