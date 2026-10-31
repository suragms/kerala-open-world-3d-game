param([Parameter(Mandatory=$true)][string]$Check)
$ErrorActionPreference = 'Stop'
$env:BROWSER_CHECKS = $Check
& node scripts/browser-suite.mjs
exit $LASTEXITCODE
