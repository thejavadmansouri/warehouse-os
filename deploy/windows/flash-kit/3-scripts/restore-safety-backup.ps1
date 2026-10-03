# Warehouse OS - EMERGENCY ONLY: restore the safety backup over the database.
# ASCII ONLY. Run as administrator. There is no double-click launcher on
# purpose: this replaces EVERYTHING in the database with the state inside the
# dump. On the safety dump taken from the development laptop that state
# includes test invoices and test customers -- only use it if the shop's own
# database is destroyed and there is nothing newer to restore from.

param(
    [string]$Root = 'C:\WarehouseOS',
    [string]$Dump = ''
)

$ErrorActionPreference = 'Continue'
Write-Host ''
Write-Host '=== EMERGENCY database restore ===' -ForegroundColor Red
Write-Host 'This DESTROYS the current database content and replaces it with' -ForegroundColor Yellow
Write-Host 'the content of the dump below. Confirm the file before going on.' -ForegroundColor Yellow
Write-Host ''

if (-not $Dump) {
    # The newest safety dump on the flash (the kit may carry several).
    $safetyDir = Join-Path $PSScriptRoot '..\1-install\backup-safety'
    $newest = Get-ChildItem -Path $safetyDir -Filter *.dump -File |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newest) { $Dump = $newest.FullName }
}
if (-not $Dump -or -not (Test-Path $Dump)) {
    Write-Host "Dump not found: $Dump" -ForegroundColor Red
    Write-Host 'Put the safety dump into 1-install\backup-safety\ on the flash.' -ForegroundColor Yellow
    exit 1
}
Write-Host ("  dump: {0}  ({1:N1} MB)" -f $Dump, ((Get-Item $Dump).Length / 1MB))

$envFile = Join-Path $Root 'config\.env'
if (-not (Test-Path $envFile)) {
    Write-Host "No configuration at $envFile" -ForegroundColor Red
    exit 1
}
$dbUrl = $null
$pgRestore = $null
foreach ($line in (Get-Content $envFile)) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*"?(.+?)"?\s*$') { $dbUrl = $Matches[1] }
    if ($line -match '^\s*PG_RESTORE_PATH\s*=\s*(.+?)\s*$')  { $pgRestore = $Matches[1] }
}
if (-not ($dbUrl -match '://[^:]+:([^@]+)@')) {
    Write-Host 'Could not read DATABASE_URL' -ForegroundColor Red
    exit 1
}
$env:PGPASSWORD = $Matches[1]
if (-not $pgRestore -or -not (Test-Path $pgRestore)) {
    $pgRestore = Join-Path $Root 'pgsql\bin\pg_restore.exe'
}

# First take a backup of what exists NOW, so even this emergency has an undo.
$now = Get-Date -Format 'yyyyMMdd-HHmmss'
$pgDump = Join-Path $Root 'pgsql\bin\pg_dump.exe'
$safety = Join-Path $Root ("backups\before-restore-{0}.dump" -f $now)
Write-Host ''
Write-Host ("  backing up the CURRENT database first -> {0}" -f $safety)
& $pgDump -U postgres -h localhost -p 5432 -Fc -f $safety warehouse_os
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Could not back up the current database -- stopping so nothing is lost.' -ForegroundColor Red
    exit 1
}

$answer = Read-Host 'Type YES (uppercase) to restore and replace the database'
if ($answer -ne 'YES') {
    Write-Host 'Cancelled. Nothing was changed.' -ForegroundColor Green
    exit 0
}

Write-Host '  restoring...'
& $pgRestore -U postgres -h localhost -p 5432 -d warehouse_os `
    --clean --if-exists --no-owner "$Dump" 2>&1 |
    Where-Object { $_ -notmatch 'does not exist, skipping' } |
    Select-Object -First 10

Write-Host '  restarting the API so it re-reads the database...'
& (Join-Path $Root 'nssm.exe') restart WarehouseOS-API 2>&1 | Out-Null
Start-Sleep -Seconds 8

try {
    $h = Invoke-WebRequest -Uri 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 8
    Write-Host ("  /health: {0}" -f $h.Content) -ForegroundColor Green
} catch {
    Write-Host '  API did not answer -- see api.log' -ForegroundColor Red
}
Write-Host ''
