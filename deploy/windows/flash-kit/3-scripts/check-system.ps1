# Warehouse OS - one-glance system status. Run any time, harmless.
# ASCII ONLY. Launcher: RUN-CHECK-SYSTEM.bat

param(
    [string]$Root = 'C:\WarehouseOS'
)

$ErrorActionPreference = 'Continue'
function Line { param($ok, $msg) if ($ok) { Write-Host "  [OK]  $msg" -ForegroundColor Green } else { Write-Host "  [!!]  $msg" -ForegroundColor Red } }

Write-Host ''
Write-Host "=== Warehouse OS -- system status ($((Get-Date).ToString('yyyy-MM-dd HH:mm'))) ===" -ForegroundColor Cyan

# 1. Services
foreach ($s in 'WarehouseOS-DB', 'WarehouseOS-API', 'WarehouseOS-Web') {
    $svc = Get-Service $s -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') { Line $true "$s Running" }
    else { Line $false "$s is $($(Get-Service $s -ErrorAction SilentlyContinue).Status) -> RUN-START-SERVICES.bat" }
}

# 2. Ports
foreach ($p in 3000, 3001) {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    Line ($null -ne $c) "Port $p listening"
}
$dbPorts = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
Line ($null -ne $dbPorts) 'Port 5432 (database) listening'

# 3. Health endpoint (proves API + database)
try {
    $h = Invoke-WebRequest -Uri 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 5
    Line $true ("API /health: {0}" -f $h.Content)
} catch {
    Line $false 'API /health did not answer 200 -> api.log'
}

# 4. Panel
try {
    $w = Invoke-WebRequest -Uri 'http://localhost:3001/' -UseBasicParsing -TimeoutSec 5
    Line $true 'Panel answers on port 3001'
} catch {
    $r = $_.Exception.Response
    if ($null -ne $r -and $null -ne $r.StatusCode) { Line $true ("Panel answers on port 3001 (HTTP {0})" -f [int]$r.StatusCode) }
    else { Line $false 'Panel did not answer -> web.log' }
}

# 5. Last errors from the logs, if any
$dataDir = Join-Path $Root 'data'
foreach ($log in 'api.log', 'web.log', 'db.log') {
    $path = Join-Path $dataDir $log
    if (Test-Path $path) {
        $hits = Select-String -Path $path -Pattern 'ERROR|FATAL|PANIC' -SimpleMatch:$false -ErrorAction SilentlyContinue |
                Select-Object -Last 2
        if ($hits) {
            Write-Host ''
            Write-Host "  last errors in ${log}:" -ForegroundColor Yellow
            foreach ($hit in $hits) { Write-Host ("    {0}" -f $hit.Line.Substring(0, [Math]::Min(160, $hit.Line.Length))) -ForegroundColor Yellow }
        }
    }
}

# 6. INSTALL-INFO quick pointer
$info = Join-Path $Root 'INSTALL-INFO.txt'
Write-Host ''
if ((Test-Path $info) -and ((Get-Item $info).Length -gt 0)) {
    Line $true 'INSTALL-INFO.txt is filled in (addresses + admin password location)'
} else {
    Line $false 'INSTALL-INFO.txt missing/empty -> RUN-FINISH-BROKEN-INSTALL.bat'
}
Write-Host ''
