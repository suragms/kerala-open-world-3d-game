param([string]$Checks = 'controls,mouse-driving,gamepad,districts,transport,settings,character-movement,movement-edges,performance,final-review,phase8,bus-stop,rail,bus-full,bus-interdistrict')
$ErrorActionPreference = 'Stop'
& npx --yes --package '@playwright/cli' playwright-cli -s=kerala open http://127.0.0.1:5173/
if ($LASTEXITCODE -ne 0) { throw 'Browser launch failed. Start the development server on port 5173 first.' }
$results = @()
foreach ($check in $Checks.Split(',')) {
    # Start each workflow from the existing avatar-selection and Thrissur entry flow.
    & powershell -NoProfile -File scripts/browser-check.ps1 -Check start
    if ($LASTEXITCODE -ne 0) { throw "Startup regression before $check" }
    & powershell -NoProfile -File scripts/browser-check.ps1 -Check $check
    $results += @{ check = $check; passed = $LASTEXITCODE -eq 0 }
    if ($LASTEXITCODE -ne 0) {
        $results | ConvertTo-Json | Set-Content output/playwright/suite-results.json -Encoding utf8
        throw "Browser regression: $check. See output/playwright/check-$check.log"
    }
}
$results | ConvertTo-Json | Set-Content output/playwright/suite-results.json -Encoding utf8
