param([Parameter(Mandatory=$true)][string]$Check)
$ErrorActionPreference = 'Stop'
$allowedChecks = @('start', 'controls', 'districts', 'transport', 'settings', 'performance', 'final-review', 'character-movement', 'movement-edges')
if ($Check -notin $allowedChecks) { throw 'Unknown browser check' }
$output = & npx --yes --package '@playwright/cli' playwright-cli -s=kerala run-code "--filename=tests/browser-$Check.js" 2>&1
$checkExit = $LASTEXITCODE
$content = $output -join "`n"
$output | Set-Content -LiteralPath "output/playwright/check-$Check.log" -Encoding utf8
if ($content -match '(?s)### Result\r?\n(.*?)\r?\n### Ran') {
    $result = $Matches[1].Trim()
    $result | Set-Content -LiteralPath "output/playwright/check-$Check.json" -Encoding utf8
    Write-Output $result
} else { $output | Select-Object -First 12 | Write-Output }
exit $checkExit
