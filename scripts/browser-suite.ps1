param([string]$Checks = '')
$ErrorActionPreference = 'Stop'
if ($Checks) { $env:BROWSER_CHECKS = $Checks }
& node scripts/browser-suite.mjs
exit $LASTEXITCODE
