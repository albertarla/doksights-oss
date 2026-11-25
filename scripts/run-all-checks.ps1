# DokSights quality gate: the Definition of Done for every change.
# Same steps as scripts/run-all-checks.sh and CI.
#
#   powershell -ExecutionPolicy Bypass -File scripts/run-all-checks.ps1
#   -List             print the step ids and exit
#   -Only id,id       run only these steps (the result is PARTIAL)
#   -Skip id,id       skip these steps (the result is PARTIAL)
param(
    [switch]$List,
    [string[]]$Only = @(),
    [string[]]$Skip = @()
)

$Root = Split-Path -Parent $PSScriptRoot
$Steps = [ordered]@{
    'secrets'            = 'gitleaks: git history + non-ignored working tree'
    'backend-tests'      = 'pytest (backend/tests)'
    'frontend-lint'      = 'ESLint, 0 errors (warnings allowed)'
    'frontend-typecheck' = 'tsc --noEmit (app + node configs)'
    'frontend-tests'     = 'Vitest unit and component tests'
    'frontend-build'     = 'vite production build'
}

if ($List) {
    foreach ($k in $Steps.Keys) { '{0,-20} {1}' -f $k, $Steps[$k] }
    exit 0
}

# Accept both "-Only a,b" and "-Only 'a,b'".
$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$Skip = @($Skip | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$Partial = ($Only.Count -gt 0) -or ($Skip.Count -gt 0)

if (-not (Test-Path (Join-Path $Root 'frontend/node_modules'))) {
    Write-Host "frontend/node_modules is missing: run 'npm ci' in frontend/ first."
    exit 1
}

function Invoke-Step([string]$Id) {
    switch ($Id) {
        'secrets' {
            if (-not (Get-Command gitleaks -ErrorAction SilentlyContinue)) {
                Write-Host 'gitleaks is not installed (https://github.com/gitleaks/gitleaks)'
                return 2
            }
            Push-Location $Root
            try {
                gitleaks git . --config .gitleaks.toml --no-banner --redact --log-level warn | Out-Host
                if ($LASTEXITCODE -ne 0) { return $LASTEXITCODE }
                # Every tracked or new non-ignored file (a local, gitignored .env may hold keys).
                $files = git ls-files -co --exclude-standard
                $content = foreach ($f in $files) { if (Test-Path $f -PathType Leaf) { Get-Content -Raw -LiteralPath $f } }
                $content | gitleaks stdin --config .gitleaks.toml --no-banner --redact --log-level warn | Out-Host
                return $LASTEXITCODE
            } finally { Pop-Location }
        }
        'backend-tests' {
            Push-Location (Join-Path $Root 'backend')
            try { python -m pytest -q -p no:cacheprovider --tb=short | Out-Host; return $LASTEXITCODE } finally { Pop-Location }
        }
        'frontend-lint' {
            Push-Location (Join-Path $Root 'frontend')
            try { npx eslint . --quiet | Out-Host; return $LASTEXITCODE } finally { Pop-Location }
        }
        'frontend-typecheck' {
            Push-Location (Join-Path $Root 'frontend')
            try { npm run --silent typecheck | Out-Host; return $LASTEXITCODE } finally { Pop-Location }
        }
        'frontend-tests' {
            Push-Location (Join-Path $Root 'frontend')
            try { npx vitest run --silent --reporter=dot | Out-Host; return $LASTEXITCODE } finally { Pop-Location }
        }
        'frontend-build' {
            Push-Location (Join-Path $Root 'frontend')
            try { npx vite build --logLevel error | Out-Host; return $LASTEXITCODE } finally { Pop-Location }
        }
    }
}

$Results = @()
$Failed = $false
foreach ($id in $Steps.Keys) {
    if (($Only.Count -gt 0 -and $Only -notcontains $id) -or ($Skip -contains $id)) {
        $Results += "SKIP  $id"
        continue
    }
    Write-Host ''
    Write-Host "==> ${id}: $($Steps[$id])"
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $code = Invoke-Step $id | Select-Object -Last 1
    $secs = [int]$watch.Elapsed.TotalSeconds
    if ($code -eq 0) { $Results += "PASS  $id (${secs}s)" }
    elseif ($code -eq 2 -and $id -eq 'secrets') { $Results += "SKIP  $id (gitleaks missing)"; $Partial = $true }
    else { $Results += "FAIL  $id (${secs}s)"; $Failed = $true }
}

Write-Host ''
Write-Host '================ Summary ================'
$Results | ForEach-Object { Write-Host $_ }
if ($Failed) { Write-Host 'RESULT: FAILED'; exit 1 }
elseif ($Partial) { Write-Host 'RESULT: PARTIAL (some steps did not run: this is not the full gate)'; exit 3 }
else { Write-Host 'RESULT: ALL CHECKS PASSED' }
