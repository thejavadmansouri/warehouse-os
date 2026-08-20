<#
    Update an existing installation.

    ASCII ONLY -- see the note at the top of build.ps1. PowerShell 5.1 syntax
    only: no ??, no &&, no ternary.

    Setup.exe alone is not an update. It replaces `app` and then stops, because
    first-run.ps1 skips itself once config\.env exists -- which is what keeps the
    database and the settings safe. The consequence is that a release carrying
    migrations installs code that expects columns the database does not have,
    and the API dies at boot with a Prisma error that says nothing about the
    real cause.

    So the four steps around Setup.exe -- back up, install, migrate, re-register
    the services -- are the update, and they are here as one command because the
    backup is the step a human skips when the shop is waiting.

    Usage (as administrator):

        .\update.ps1 -Setup C:\dl\WarehouseOS-Setup-0.3.0.exe

    If Setup.exe was already run by hand, finish the rest with:

        .\update.ps1 -SkipSetup
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [string]$Setup,
    [switch]$SkipSetup,
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001,
    # Rollback copies of `app` to keep. Each is roughly the size of the package.
    [int]$KeepVersions = 2
)

$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host $m -ForegroundColor Yellow }

# ------------------------------------------------------------------ preflight

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this in an administrator PowerShell. Services and the database need it.'
}

$envFile  = Join-Path $Root 'config\.env'
$backups  = Join-Path $Root 'backups'
$versions = Join-Path $Root 'versions'
$appDir   = Join-Path $Root 'app'
$pgBin    = Join-Path $Root 'pgsql\bin'
$pgDump   = Join-Path $pgBin 'pg_dump.exe'
$pgRest   = Join-Path $pgBin 'pg_restore.exe'
$svcScript = Join-Path $Root 'scripts\services.ps1'

if (-not (Test-Path $envFile)) {
    throw "No configuration at $envFile -- this machine has no installation to update. Run Setup.exe on its own for a first install."
}
foreach ($p in @($pgDump, $pgRest, $appDir)) {
    if (-not (Test-Path $p)) { throw "Missing from the installation: $p" }
}
if (-not $SkipSetup) {
    if (-not $Setup) { throw 'Give the new installer with -Setup <path to Setup.exe>, or -SkipSetup if it has already been run.' }
    if (-not (Test-Path $Setup)) { throw "Installer not found: $Setup" }
}

# The Prisma CLI reads DATABASE_URL from the environment, and the only copy of
# the password is in config\.env. Read it from there rather than asking.
$dbUrl = $null
foreach ($line in (Get-Content $envFile)) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+)$') {
        $dbUrl = $matches[1].Trim().Trim('"')
    }
}
if (-not $dbUrl) { throw "DATABASE_URL is not in $envFile" }

$DB = 'WarehouseOS-DB'
function Ensure-Db {
    $svc = Get-Service $DB -ErrorAction SilentlyContinue
    if (-not $svc) { throw "The $DB service is not registered. This installation is incomplete." }
    if ($svc.Status -ne 'Running') {
        Start-Service $DB
        Start-Sleep -Seconds 5
    }
    $svc.Refresh()
    if ((Get-Service $DB).Status -ne 'Running') {
        throw "The database service will not start. See $Root\data\db.log"
    }
}

# --------------------------------------------------------------------- backup
# First, and non-negotiable. A migration is not reversible; without the dump
# taken here there is no way back from a bad release.

Say 'Starting the database'
Ensure-Db

Say 'Backing up'
New-Item -ItemType Directory -Force -Path $backups | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dump  = Join-Path $backups ("pre-update-$stamp.dump")
& $pgDump -h localhost -U postgres -Fc -f $dump warehouse_os
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed. Stopping -- do not update without a backup.' }

# A dump that was never read back is a rumour. pg_restore -l parses the whole
# archive; an empty or truncated file fails here rather than on the day it is
# needed.
$toc = & $pgRest -l $dump 2>&1
if ($LASTEXITCODE -ne 0 -or -not $toc) { throw "The backup at $dump could not be read back. Stopping." }
$size = [math]::Round((Get-Item $dump).Length / 1MB, 1)
Write-Host ("  {0}  ({1} MB, readable)" -f $dump, $size)

# ------------------------------------------------------------------- rollback
# Setup.exe overwrites `app` in place, so the copy has to be taken now.

Say 'Keeping a copy of the current version'
New-Item -ItemType Directory -Force -Path $versions | Out-Null
$snapshot = Join-Path $versions $stamp
Copy-Item $appDir $snapshot -Recurse
Write-Host "  $snapshot"

$old = Get-ChildItem $versions -Directory | Sort-Object Name -Descending | Select-Object -Skip $KeepVersions
foreach ($d in $old) {
    Remove-Item $d.FullName -Recurse -Force
    Write-Host ("  removed old version {0}" -f $d.Name)
}

# ---------------------------------------------------------------------- setup

if (-not $SkipSetup) {
    Say 'Running the installer'
    Write-Host '  The wizard opens. Finish it, then this script continues.'
    $proc = Start-Process -FilePath $Setup -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        throw ("The installer exited with {0}. Nothing has been migrated; the old version is at {1}" -f $proc.ExitCode, $snapshot)
    }
}

# ------------------------------------------------------------------ migration

Say 'Starting the database again'
Ensure-Db

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
    if ($LASTEXITCODE -ne 0) {
        $restore = "  {0} -h localhost -U postgres -d warehouse_os -c --clean --if-exists {1}" -f $pgRest, $dump
        throw "prisma migrate deploy failed. The database is unchanged; restore it with:`n$restore"
    }
} finally {
    Pop-Location
}

# ------------------------------------------------------------------- services

Say 'Re-registering the services'
if (-not (Test-Path $svcScript)) { throw "Missing: $svcScript" }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $svcScript -Root $Root -ApiPort $ApiPort -WebPort $WebPort
if ($LASTEXITCODE -ne 0) { throw 'services.ps1 failed' }

# ---------------------------------------------------------------------- check
# The services reporting Running only means a process exists. Ask both ports for
# an answer, the way a phone on the shop floor will.

Say 'Checking that both answer'
$failed = @()
foreach ($t in @(@{ n = 'API'; p = $ApiPort }, @{ n = 'Panel'; p = $WebPort })) {
    $url = "http://localhost:$($t.p)/"
    $ok = $false
    foreach ($try in 1..10) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 | Out-Null
            $ok = $true
            break
        } catch {
            # A 4xx is still an answer -- something is listening and routing.
            if ($_.Exception.Response) { $ok = $true; break }
            Start-Sleep -Seconds 3
        }
    }
    if ($ok) {
        Write-Host ("  {0,-8} {1}  OK" -f $t.n, $url)
    } else {
        Write-Host ("  {0,-8} {1}  NO ANSWER" -f $t.n, $url) -ForegroundColor Red
        $failed += $t.n
    }
}

Write-Host ''
if ($failed.Count -gt 0) {
    Warn ("Not answering: {0}. Logs are in {1}\data" -f ($failed -join ', '), $Root)
    Warn 'To go back:'
    Warn ("  1. Stop the services:  Stop-Service WarehouseOS-Web, WarehouseOS-API")
    Warn ("  2. Restore the code:   Remove-Item {0} -Recurse -Force; Copy-Item {1} {0} -Recurse" -f $appDir, $snapshot)
    Warn ("  3. Restore the data:   {0} -h localhost -U postgres -d warehouse_os -c --clean --if-exists {1}" -f $pgRest, $dump)
    Warn ("  4. Register again:     {0}" -f $svcScript)
    exit 1
}

Say 'Done'
Write-Host ("  backup   {0}" -f $dump)
Write-Host ("  rollback {0}" -f $snapshot)
Write-Host ''
Write-Host '  Open the panel on the seller PC and place one test sale before leaving.'
