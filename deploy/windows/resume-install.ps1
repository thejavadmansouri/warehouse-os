<#
    Completes a half-finished first run.

    first-run.ps1 is deliberately one-shot: it bails out when config\.env
    already exists, so a repair install or an update can never re-create
    secrets over a working database. But the same bail-out means an install
    that died halfway -- a file missing from the payload, a full disk --
    cannot be finished by running first-run again, and finishing it by hand
    one command at a time is how mistakes happen.

    This script finishes exactly the steps that come after the database
    exists: migrations, the backup folder, the services, the firewall, the
    shortcuts, the health watch and the INSTALL-INFO file. It refuses to run
    against an install that was never set up, and it never touches secrets,
    the database cluster or the operator's settings.

    ASCII ONLY -- see the note at the top of build.ps1.
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001
)

$ErrorActionPreference = 'Stop'
function Say($m)  { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "!!! $m" -ForegroundColor Yellow }

# Same Persian labels first-run.ps1 builds, from code points so this file
# stays pure ASCII (PowerShell 5.1 reads .ps1 with the system codepage).
function FromCodePoints([int[]]$points) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($p in $points) { [void]$sb.Append([char]$p) }
    return $sb.ToString()
}
$LabelPanel  = FromCodePoints @(0x067E,0x0646,0x0644,0x0020,0x0641,0x0631,0x0648,0x0634)
$LabelFolder = FromCodePoints @(0x067E,0x0648,0x0634,0x0647,0x0020,0x0646,0x0635,0x0628)
$LabelPos    = FromCodePoints @(0x0635,0x0646,0x062F,0x0648,0x0642,0x0020,0x0641,0x0631,0x0648,0x0634)
$SellerExe   = Join-Path $Root 'app\desktop\warehouse-seller.exe'

$pgBin      = Join-Path $Root 'pgsql\bin'
$envFile    = Join-Path $Root 'config\.env'
$backups    = Join-Path $Root 'backups'
$installLog = Join-Path $Root 'data\install.log'
$resumeLog  = Join-Path $Root 'data\resume.log'

if (-not (Test-Path $envFile)) {
    throw "config\.env does not exist -- this install was never set up. Run $Root\scripts\first-run.ps1; resume-install only finishes a half-finished setup."
}

Start-Transcript -Path $resumeLog -Force | Out-Null

# ---------------------------------------------------------------- preflight
Say 'Checking the files this install needs'
$required = @(
    (Join-Path $Root 'app\node\node.exe'),
    (Join-Path $Root 'app\api\dist\src\main.js'),
    (Join-Path $Root 'app\api\node_modules\prisma\build\index.js'),
    (Join-Path $Root 'app\web\server.js'),
    (Join-Path $Root 'nssm.exe'),
    (Join-Path $Root 'pgsql\bin\postgres.exe')
)
$missing = @($required | Where-Object { -not (Test-Path $_) })
if ($missing.Count -gt 0) {
    foreach ($m in $missing) { Warn "Missing: $m" }
    throw 'The install is incomplete. Copy the missing file(s) from the setup payload and run this script again.'
}
Write-Host '  all present'

# ------------------------------------------------------------------ settings
Say 'Reading config\.env'
$dbUrl = $null
foreach ($line in (Get-Content $envFile)) {
    if ($line -match '^\s*DATABASE_URL="([^"]+)"') { $dbUrl = $Matches[1] }
}
if (-not $dbUrl) { throw 'DATABASE_URL not found in config\.env' }
# psql needs the password as PGPASSWORD; it sits inside the URL.
if ($dbUrl -match '://[^:]+:([^@]+)@') { $env:PGPASSWORD = $Matches[1] }

# ------------------------------------------------------------------- schema
Say 'Running migrations'
$node      = Join-Path $Root 'app\node\node.exe'
$api       = Join-Path $Root 'app\api'
$prismaCli = Join-Path $api 'node_modules\prisma\build\index.js'
$env:DATABASE_URL = $dbUrl
Push-Location $api
try {
    & $node $prismaCli migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy failed' }
} finally {
    Pop-Location
}

<#
    Same as first-run.ps1: pin the backup folder now, ON CONFLICT DO NOTHING so
    a destination the manager picked in the UI is never overwritten.
#>
Say 'Setting the backup folder'
$destSql = $backups.Replace("'", "''")
$seedSql = @"
INSERT INTO "BackupConfig" ("id", "destination", "updatedAt")
VALUES ('singleton', '$destSql', NOW())
ON CONFLICT ("id") DO NOTHING;
"@
$seedSql | & (Join-Path $pgBin 'psql.exe') -h localhost -U postgres -d warehouse_os -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { throw 'could not set the backup folder' }

# ----------------------------------------------------------------- services
Say 'Registering the services'
& (Join-Path $Root 'scripts\services.ps1') -Root $Root -ApiPort $ApiPort -WebPort $WebPort

# ----------------------------------------------------------------- firewall
Say 'Opening the ports on the local network'
foreach ($p in @($ApiPort, $WebPort)) {
    netsh advfirewall firewall delete rule name="WarehouseOS $p" 2>&1 | Out-Null
    netsh advfirewall firewall add rule name="WarehouseOS $p" `
        dir=in action=allow protocol=TCP localport=$p profile=any | Out-Null
}
try {
    Get-NetConnectionProfile -ErrorAction Stop |
        Where-Object { $_.NetworkCategory -eq 'Public' } |
        ForEach-Object {
            Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
        }
} catch {
    Warn "Could not switch the network to Private (not fatal): $($_.Exception.Message)"
}

# --------------------------------------------------- seller shell + shortcuts
Say 'Creating shortcuts'
if (Test-Path $SellerExe) {
    $sellerCfgDir = Join-Path $env:APPDATA 'com.warehouseos.seller'
    try {
        New-Item -ItemType Directory -Force -Path $sellerCfgDir | Out-Null
        $sellerCfg = Join-Path $sellerCfgDir 'config.json'
        if (-not (Test-Path $sellerCfg)) {
            $json = '{"server_url":"http://localhost:' + $WebPort + '","printer_name":""}'
            [IO.File]::WriteAllText($sellerCfg, $json, [Text.Encoding]::ASCII)
            Write-Host '  seller app pre-configured: http://localhost:'$WebPort
        } else {
            Write-Host '  seller app config already present - left untouched'
        }

        $ws = New-Object -ComObject WScript.Shell
        $desktop = [Environment]::GetFolderPath('Desktop')
        $lnk = $ws.CreateShortcut((Join-Path $desktop 'Warehouse OS.lnk'))
        $lnk.TargetPath = $SellerExe
        $lnk.WorkingDirectory = (Split-Path -Parent $SellerExe)
        $lnk.IconLocation = "$SellerExe,0"
        $lnk.Save()

        $group = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Warehouse OS'
        New-Item -ItemType Directory -Force -Path $group | Out-Null
        try {
            $lnk2 = $ws.CreateShortcut((Join-Path $group ($LabelPos + '.lnk')))
            $lnk2.TargetPath = $SellerExe
            $lnk2.WorkingDirectory = (Split-Path -Parent $SellerExe)
            $lnk2.Save()
        } catch {
            $url = "[InternetShortcut]" + [char]13 + [char]10 + "URL=file:///" + ($SellerExe -replace '\\','/')
            Set-Content -Path (Join-Path $group 'Warehouse OS POS.url') -Encoding ascii -Value $url
        }
    } catch {
        Warn "Seller shell setup failed (not fatal): $($_.Exception.Message)"
    }
} else {
    Write-Host '  no seller app in this install - skipping the POS shortcut'
}
# Panel + install-folder links in the Start Menu (best-effort, like first-run).
try {
    $group = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Warehouse OS'
    New-Item -ItemType Directory -Force -Path $group | Out-Null
    Set-Content -Path (Join-Path $group "$LabelPanel.url") -Encoding ascii `
        -Value "[InternetShortcut]`r`nURL=http://localhost:$WebPort"
    Set-Content -Path (Join-Path $group "$LabelFolder.url") -Encoding ascii `
        -Value "[InternetShortcut]`r`nURL=file:///$($Root -replace '\\','/')"
} catch {
    Warn "Could not create Start Menu shortcuts (not fatal): $($_.Exception.Message)"
}

# ------------------------------------------------------------ health check
function Wait-Http([string]$url, [int]$timeoutSeconds, [switch]$RequireOk) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 | Out-Null
            return $true
        } catch {
            $response = $_.Exception.Response
            if ($RequireOk) {
                if ($null -ne $response -and [int]$response.StatusCode -eq 200) { return $true }
            } elseif ($null -ne $response -and $null -ne $response.StatusCode) { return $true }
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

Say 'Checking that the services answer'
$apiOk = Wait-Http "http://localhost:$ApiPort/health" 90 -RequireOk
$webOk = Wait-Http "http://localhost:$WebPort/" 60

Say 'Registering the health watch'
& (Join-Path $Root 'scripts\health-watch.ps1') -Install

# Same rule as first-run.ps1: the address the phones must reach is the one on
# the interface that owns the default route -- not "first non-loopback IPv4",
# which on a machine with WSL/Hyper-V/VMware picks a virtual adapter (172.18.x)
# that no phone can reach.
function Select-LanIp {
    $best = $null
    try {
        $best = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
                Sort-Object RouteMetric | Select-Object -First 1
    } catch { }
    if ($best) {
        $addr = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $best.InterfaceIndex -ErrorAction SilentlyContinue |
                Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
                Select-Object -First 1
        if ($addr) { return $addr.IPAddress }
    }
    return (Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
            Sort-Object -Property InterfaceMetric |
            Select-Object -First 1).IPAddress
}
$ip = Select-LanIp

Write-Host ''
if ($apiOk -and $webOk) {
    Write-Host '=======================================================' -ForegroundColor Green
    Write-Host '  Install complete -- both services are answering' -ForegroundColor Green
    Write-Host '=======================================================' -ForegroundColor Green
} else {
    Write-Host '=======================================================' -ForegroundColor Red
    Write-Host '  Installed, but a service is NOT answering' -ForegroundColor Red
    Write-Host '=======================================================' -ForegroundColor Red
    if (-not $apiOk) { Warn "API did not answer on port $ApiPort. See $Root\data\api.log" }
    if (-not $webOk) { Warn "Panel did not answer on port $WebPort. See $Root\data\web.log" }
}

Write-Host ''
Write-Host "  Sales panel:  http://${ip}:$WebPort" -ForegroundColor White
Write-Host "  API address:  http://${ip}:$ApiPort   (for the worker phones)" -ForegroundColor White
Write-Host ''
Warn 'Reserve this IP on the router, or tomorrow it changes and everything disconnects.'
Warn "The secrets are in $envFile. Lose it and the database cannot be opened."
Write-Host ''
Write-Host "  Backups run nightly into $backups" -ForegroundColor White
Write-Host '  The first admin password is written to the API log once and only' -ForegroundColor White
Write-Host "  once:  $Root\data\api.log" -ForegroundColor White
Write-Host ''

$status = 'OK'
if (-not ($apiOk -and $webOk)) { $status = 'CHECK THE LOG - a service did not answer' }
@"
Warehouse OS -- install completed by resume-install $(Get-Date -Format 'yyyy-MM-dd HH:mm')
Status: $status

  Sales panel (this PC and the seller PC):
      http://${ip}:$WebPort

  API address (enter this in the worker phones):
      http://${ip}:$ApiPort

  First admin login:
      username: admin
      password: written once into $Root\data\api.log

Important
  - Reserve $ip on the router. If it changes, the phones and the seller
    PC stop connecting.
  - Backups run nightly at 23:00 into $backups
    Copy them to another disk or a network share as well -- a backup on the
    same disk as the database is not a backup.
  - The secrets live in $envFile
    Lose that file and the database cannot be opened.

Services (start, stop, check)
  $Root\nssm.exe restart WarehouseOS-API
  Logs: $Root\data\api.log, web.log, db.log
  If a service is missing or not answering, run:
      $Root\scripts\resume-install.ps1 -Root $Root
  Install log: $installLog
  Resume log:  $resumeLog
"@ | Set-Content -Path (Join-Path $Root 'INSTALL-INFO.txt') -Encoding utf8

Stop-Transcript | Out-Null

if (-not ($apiOk -and $webOk)) { exit 1 }
