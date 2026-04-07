$ErrorActionPreference = "Stop"

Push-Location "$PSScriptRoot\packages\roboviz"
npm run pack
$tgz = Get-ChildItem *.tgz | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Pop-Location
Write-Host "Run: npx ./packages/roboviz/$($tgz.Name) serve <file>"
