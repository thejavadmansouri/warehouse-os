# Warehouse OS - start or restart the three services and check they answer.
# ASCII ONLY. Launcher: RUN-START-SERVICES.bat  (run as administrator)

param(
    [string]$Root = 'C:\WarehouseOS'
)

$ErrorActionPreference = 'Continue'
$nssm = Join-Path $Root 'nssm.exe'
if (-not (Test-Path $nssm)) {
    Write-Host "No installation at $Root (nssm.exe missing). Run Setup first." -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host "=== Restarting Warehouse OS services (root: $Root) ===" -ForegroundColor Cyan

foreach ($s in 'WarehouseOS-DB', 'WarehouseOS-API', 'WarehouseOS-Web') {
    & $nssm restart $s 2>&1 | Out-Null
}
Start-Sleep -Seconds 6

foreach ($s in 'WarehouseOS-DB', 'WarehouseOS-API', 'WarehouseOS-Web') {
    $state = (Get-Service $s -ErrorAction SilentlyContinue).Status
    if ($state -eq 'Running') {
        Write-Host ("  [OK]  {0,-18} Running" -f $s) -ForegroundColor Green
    } else {
        Write-Host ("  [!!]  {0,-18} {1}  -> see {2}\data\" -f $s, $state, $Root) -ForegroundColor Red
    }
}

# The real test: do the services answer HTTP?
function Probe([string]$url) {
    try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        $r = $_.Exception.Response
        if ($null -ne $r -and $null -ne $r.StatusCode) { return $true }  # any HTTP answer = alive
        return $false
    }
}
Start-Sleep -Seconds 4
$apiOk = Probe "http://localhost:3000/health"
$webOk = Probe "http://localhost:3001/"
Write-Host ''
if ($apiOk) { Write-Host '  [OK]  API answers on port 3000'      -ForegroundColor Green }
else        { Write-Host '  [!!]  API does NOT answer (see api.log)' -ForegroundColor Red }
if ($webOk) { Write-Host '  [OK]  Panel answers on port 3001'     -ForegroundColor Green }
else        { Write-Host '  [!!]  Panel does NOT answer (see web.log)' -ForegroundColor Red }
Write-Host ''
