<#
    Quick code-only deploy of web (Next standalone) and API (Nest dist).

    ASCII ONLY. PowerShell 5.1 syntax. No migrations: the changes are code-only
    (three prices use existing ProductPrice columns), so there is no DB step.

    Usage (as administrator):
        powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-quick.ps1
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [string]$WebSrc = 'C:\warehouse-os\apps\web\.next\standalone',
    [string]$ApiSrc = 'C:\warehouse-os\apps\api\dist'
)

$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }

$appDir   = Join-Path $Root 'app'
$webDir   = Join-Path $appDir 'web'
$apiDir   = Join-Path $appDir 'api'
$apiDist  = Join-Path $apiDir 'dist'
$versions = Join-Path $Root 'versions'

# ------------------------------------------------------------------ preflight
Say 'Preflight'
if (-not (Test-Path (Join-Path $WebSrc 'apps\web\server.js'))) { throw "Web build missing server.js at $WebSrc" }
if (-not (Test-Path (Join-Path $ApiSrc 'src\main.js'))) { throw "API build missing src\main.js at $ApiSrc" }
if (-not (Test-Path $webDir)) { throw "No web install at $webDir" }
if (-not (Test-Path $apiDist)) { throw "No API dist at $apiDist" }
Write-Host '  paths OK'

# -------------------------------------------------------------------- backup
Say 'Backing up current web and api\dist'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$snap = Join-Path $versions "predeploy-$stamp"
New-Item -ItemType Directory -Force -Path $snap | Out-Null
Copy-Item $webDir (Join-Path $snap 'web') -Recurse -Force
Copy-Item $apiDist (Join-Path $snap 'api-dist') -Recurse -Force
Write-Host "  $snap"

# --------------------------------------------------------------------- stop
Say 'Stopping web and api services'
foreach ($n in @('WarehouseOS-Web', 'WarehouseOS-API')) {
    $svc = Get-Service $n -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne 'Stopped') {
        Stop-Service $n -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 3

# ------------------------------------------------------------------ replace
Say 'Replacing web panel (Next standalone)'
Remove-Item $webDir -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $WebSrc $webDir -Recurse
Write-Host '  web copied'

Say 'Replacing API dist'
Remove-Item $apiDist -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $ApiSrc $apiDist -Recurse
Write-Host '  api dist copied'

# -------------------------------------------------------------------- start
Say 'Starting services'
foreach ($n in @('WarehouseOS-API', 'WarehouseOS-Web')) {
    $svc = Get-Service $n -ErrorAction SilentlyContinue
    if ($svc) { Start-Service $n -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 8

# ---------------------------------------------------------------- health check
Say 'Health check'
$failed = @()
foreach ($t in @(@{ n = 'API';   u = 'http://localhost:3000/health' },
                 @{ n = 'Panel'; u = 'http://localhost:3001/' })) {
    $ok = $false
    foreach ($try in 1..10) {
        try {
            Invoke-WebRequest -Uri $t.u -UseBasicParsing -TimeoutSec 5 | Out-Null
            $ok = $true; break
        } catch {
            if ($_.Exception.Response) { $ok = $true; break }
            Start-Sleep -Seconds 3
        }
    }
    Write-Host ("  {0,-6} {1}  {2}" -f $t.n, $t.u, ($(if ($ok) { 'OK' } else { 'NO ANSWER' })))
    if (-not $ok) { $failed += $t.n }
}

Write-Host ''
if ($failed.Count -gt 0) {
    Write-Host ("Not answering: {0}. Logs in {1}\data. Rollback at {2}" -f ($failed -join ', '), $Root, $snap) -ForegroundColor Red
    Write-Host ("  restore web:   Remove-Item {0} -Recurse -Force; Copy-Item {1}\web {0} -Recurse" -f $webDir, $snap)
    Write-Host ("  restore api:   Remove-Item {0} -Recurse -Force; Copy-Item {1}\api-dist {0} -Recurse" -f $apiDist, $snap)
    exit 1
}
Say 'Deploy OK'
Write-Host ("  backup {0}" -f $snap)
