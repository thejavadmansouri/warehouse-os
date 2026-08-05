<#
    First run on the customer's server. The installer calls this after copying
    the files.

    ASCII ONLY -- see the note at the top of build.ps1. Windows PowerShell 5.1
    reads .ps1 using the system ANSI codepage, so a non-ASCII byte here breaks
    the parser on the customer's machine. Persian strings that the customer sees
    are built from code points instead.

    This only means anything once: if `config\.env` already exists it bails out
    and overwrites nothing, which is what makes an update safe.

    The layout is deliberate: everything belonging to the customer (data, config,
    backups) lives outside `app`, because an update replaces only `app`.
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001
)

$ErrorActionPreference = 'Stop'
function Say($m)  { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "!!! $m" -ForegroundColor Yellow }

# Persian labels the customer sees, built from code points so this file stays
# pure ASCII. "panel-e forush" (sales panel) and "pooshe-ye nasb" (install folder).
function FromCodePoints([int[]]$points) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($p in $points) { [void]$sb.Append([char]$p) }
    return $sb.ToString()
}
$LabelPanel  = FromCodePoints @(0x067E,0x0646,0x0644,0x0020,0x0641,0x0631,0x0648,0x0634)
$LabelFolder = FromCodePoints @(0x067E,0x0648,0x0634,0x0647,0x0020,0x0646,0x0635,0x0628)

$pgBin   = Join-Path $Root 'pgsql\bin'
$dataDir = Join-Path $Root 'data\pg'
$config  = Join-Path $Root 'config'
$envFile = Join-Path $config '.env'
$backups = Join-Path $Root 'backups'

New-Item -ItemType Directory -Force -Path `
    (Join-Path $Root 'data'), $config, $backups,
    (Join-Path $Root 'versions') | Out-Null

# The installer closes this console the moment the script ends, so everything
# below would otherwise be unreadable -- including the reason it failed.
$installLog = Join-Path $Root 'data\install.log'
Start-Transcript -Path $installLog -Force | Out-Null

if (Test-Path $envFile) {
    Warn 'config\.env already exists -- this install is already set up. Skipping.'
    Stop-Transcript | Out-Null
    exit 0
}

# ------------------------------------------------------------------ secrets
Say 'Generating this installation''s secrets'
# Every install gets its own password and signing key. A shared key means anyone
# who knows it can forge an admin token for any customer's system.
function New-Secret([int]$bytes) {
    $b = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','x').Replace('/','y')
}
$dbPassword = New-Secret 24
$jwtSecret  = New-Secret 48

# ----------------------------------------------------------------- database
Say 'Creating the database'
$pwFile = Join-Path $env:TEMP 'wos-pg-pw.txt'
Set-Content -Path $pwFile -Value $dbPassword -NoNewline -Encoding ascii
try {
    & (Join-Path $pgBin 'initdb.exe') `
        -D $dataDir -U postgres --pwfile=$pwFile `
        --encoding=UTF8 --locale=C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
} finally {
    Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
}

# Listen on localhost only. The database must never be reachable from the
# network -- the phones and the seller PC talk to the API, not to Postgres.
Add-Content (Join-Path $dataDir 'postgresql.conf') "`nlisten_addresses = 'localhost'"

<#
    Hand the data directory to the account the database service runs as.

    postgres.exe refuses to run under an administrative account on Windows, so
    the service runs as NetworkService (see services.ps1). This script is
    elevated, so everything it just created is owned by Administrators and
    NetworkService could not write a single WAL record.

    (OI)(CI)F = full control, inherited by files and subdirectories.
#>
# *S-1-5-20 is the well-known SID for NetworkService. Used instead of the name
# because "NT AUTHORITY\NetworkService" is localized on a non-English Windows
# and icacls would not resolve it.
Say 'Granting the database folder to the service account'
& icacls $dataDir /grant '*S-1-5-20:(OI)(CI)F' /T /Q
if ($LASTEXITCODE -ne 0) { throw 'could not grant the data directory to NetworkService' }
# NSSM writes the service logs under the same account.
& icacls (Join-Path $Root 'data') /grant '*S-1-5-20:(OI)(CI)F' /Q
if ($LASTEXITCODE -ne 0) { throw 'could not grant the data folder to NetworkService' }

<#
    Start the real service rather than a temporary elevated postgres.

    `pg_ctl start` from here would inherit this script's administrative token
    and hit exactly the refusal described above. Registering the service first
    means the database comes up the same way it will every morning after that.
#>
Say 'Starting the database service'
& (Join-Path $Root 'scripts\services.ps1') -Root $Root -DbOnly

Say 'Waiting for the database to accept connections'
$pgReady = Join-Path $pgBin 'pg_isready.exe'
$dbUp = $false
foreach ($attempt in 1..30) {
    & $pgReady -h localhost -q
    if ($LASTEXITCODE -eq 0) { $dbUp = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $dbUp) { throw "The database did not accept connections. See $Root\data\db.log" }

$env:PGPASSWORD = $dbPassword
& (Join-Path $pgBin 'createdb.exe') -h localhost -U postgres warehouse_os
if ($LASTEXITCODE -ne 0) { throw 'createdb failed' }

# ------------------------------------------------------------------- config
Say 'Writing config\.env'
$dbUrl = "postgresql://postgres:$dbPassword@localhost:5432/warehouse_os?schema=public"

<#
    Written as ASCII on purpose, and not with -Encoding utf8: Windows
    PowerShell 5.1's "utf8" means UTF-8 *with* a BOM, and those three leading
    bytes end up glued to the first key name when Node parses the file --
    DATABASE_URL silently goes missing and the API will not start.

    Paths are left unquoted so backslashes cannot be read as escapes.
#>
@"
# Settings for this installation. An update never touches this file.
# WARNING: the passwords exist only here. Lose this file and the database
# cannot be opened.

DATABASE_URL="$dbUrl"
JWT_SECRET="$jwtSecret"
NODE_ENV=production

# pg_dump is not on PATH on Windows. Without these two the nightly backup
# fails every night and the only sign is a line in the log.
PG_DUMP_PATH=$pgBin\pg_dump.exe
PG_RESTORE_PATH=$pgBin\pg_restore.exe

# Voice input auto-confirm -- off, because the matcher was 71% accurate.
AUTO_CONFIRM_ENABLED=false
"@ | Set-Content -Path $envFile -Encoding ascii

# ------------------------------------------------------------------- schema
Say 'Running migrations'
$node = Join-Path $Root 'app\node\node.exe'
$api  = Join-Path $Root 'app\api'
$prismaCli = Join-Path $api 'node_modules\prisma\build\index.js'
if (-not (Test-Path $prismaCli)) {
    throw "The Prisma CLI is missing from the package: $prismaCli. The build is incomplete -- rerun build.ps1."
}
$env:DATABASE_URL = $dbUrl
Push-Location $api
try {
    & $node $prismaCli migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy failed' }
} finally {
    Pop-Location
}

<#
    Pin the backup folder now.

    Left unset, the server falls back to a path derived from its own working
    directory, which lands next to the code rather than in the customer's
    `backups` folder -- so the backups an operator was told to look for are not
    where they were told to look. ON CONFLICT DO NOTHING means a destination the
    manager later picks in the UI is never overwritten by a repair install.
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
# Registers all three in dependency order. The database is re-registered with
# the same settings, which costs a restart and keeps one definition of a service.
& (Join-Path $Root 'scripts\services.ps1') -Root $Root -ApiPort $ApiPort -WebPort $WebPort

# ----------------------------------------------------------------- firewall
Say 'Opening the ports on the local network'
foreach ($p in @($ApiPort, $WebPort)) {
    netsh advfirewall firewall delete rule name="WarehouseOS $p" | Out-Null
    netsh advfirewall firewall add rule name="WarehouseOS $p" `
        dir=in action=allow protocol=TCP localport=$p profile=private,domain | Out-Null
}
# The database port is deliberately never opened.

# ---------------------------------------------------------------- shortcuts
# Created here rather than in installer.iss because the labels are Persian and
# the .iss has to stay ASCII too. They live in the Start Menu group so the
# uninstaller can remove them by folder name.
Say 'Creating shortcuts'
$group = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Warehouse OS'
New-Item -ItemType Directory -Force -Path $group | Out-Null
Set-Content -Path (Join-Path $group "$LabelPanel.url") -Encoding ascii `
    -Value "[InternetShortcut]`r`nURL=http://localhost:$WebPort"

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $group "$LabelFolder.lnk"))
$lnk.TargetPath = $Root
$lnk.Save()

# ------------------------------------------------------------- health check
# Either this says OK or it says exactly what failed. Finishing an install with
# "probably fine" is how a warehouse discovers on Saturday morning that it is not.
function Wait-Http([string]$url, [int]$timeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 | Out-Null
            return $true
        } catch {
            <#
                Windows PowerShell throws on any non-2xx response, and the API's
                root route answers 401 because it is behind the auth guard. A
                status code of any kind still proves the service is listening
                and routing; only a connection failure means it is not up.
            #>
            $response = $_.Exception.Response
            if ($null -ne $response -and $null -ne $response.StatusCode) { return $true }
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

Say 'Checking that the services answer'
$apiOk = Wait-Http "http://localhost:$ApiPort/" 60
$webOk = Wait-Http "http://localhost:$WebPort/" 60

# --------------------------------------------------------------- the address
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
       Sort-Object -Property InterfaceMetric |
       Select-Object -First 1).IPAddress

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

<#
    The same facts as a file, because the console window disappears with the
    installer and these are the addresses the phones and the seller PC need.
    The installer opens this at the end.
#>
$status = 'OK'
if (-not ($apiOk -and $webOk)) { $status = 'CHECK THE LOG - a service did not answer' }
@"
Warehouse OS -- installed $(Get-Date -Format 'yyyy-MM-dd HH:mm')
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
  Install log: $installLog
"@ | Set-Content -Path (Join-Path $Root 'INSTALL-INFO.txt') -Encoding utf8

Stop-Transcript | Out-Null

if (-not ($apiOk -and $webOk)) { exit 1 }
