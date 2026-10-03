# Warehouse OS - (re)import the product catalog from the flash.
# ASCII ONLY. Launcher: RUN-RELOAD-CATALOG.bat  (run as administrator)
#
# pg_restore with --data-only is safe to run more than once: rows that already
# exist fail individually and the rest goes in. The dump holds ONLY catalog
# tables (products, barcodes, brands, categories, vehicles) -- never invoices
# or customers.

param(
    [string]$Root = 'C:\WarehouseOS',
    [string]$Dump = ''
)

$ErrorActionPreference = 'Continue'
Write-Host ''
Write-Host '=== Importing the product catalog ===' -ForegroundColor Cyan

if (-not $Dump) {
    # Default: the catalog sits next to this script's folder on the flash.
    $Dump = Join-Path $PSScriptRoot '..\1-install\catalog-only.dump'
}
if (-not (Test-Path $Dump)) {
    Write-Host "Catalog dump not found: $Dump" -ForegroundColor Red
    exit 1
}

$envFile = Join-Path $Root 'config\.env'
if (-not (Test-Path $envFile)) {
    Write-Host "No configuration at $envFile -- install Setup first." -ForegroundColor Red
    exit 1
}

$dbUrl = $null
$pgRestore = $null
foreach ($line in (Get-Content $envFile)) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*"?(.+?)"?\s*$') { $dbUrl = $Matches[1] }
    if ($line -match '^\s*PG_RESTORE_PATH\s*=\s*(.+?)\s*$')  { $pgRestore = $Matches[1] }
}
if (-not $dbUrl -or -not ($dbUrl -match '://[^:]+:([^@]+)@')) {
    Write-Host 'Could not read DATABASE_URL from config\.env' -ForegroundColor Red
    exit 1
}
$env:PGPASSWORD = $Matches[1]
if (-not $pgRestore -or -not (Test-Path $pgRestore)) {
    $pgRestore = Join-Path $Root 'pgsql\bin\pg_restore.exe'
}
if (-not (Test-Path $pgRestore)) {
    Write-Host "pg_restore not found at $pgRestore" -ForegroundColor Red
    exit 1
}

Write-Host "  dump     : $Dump"
Write-Host "  database : $((Get-Content $envFile | Select-String 'DATABASE_URL').ToString())"
Write-Host '  importing... (33k products, about a minute)'

& $pgRestore -U postgres -h localhost -p 5432 -d warehouse_os `
    --data-only --disable-triggers --no-owner "$Dump" 2>&1 |
    Where-Object { $_ -notmatch 'already exists|duplicate key' } |
    Select-Object -First 12

Write-Host ''
Write-Host 'Done. Refresh the panel with Ctrl+R and search a few products.' -ForegroundColor Green
Write-Host 'Re-running this script is harmless -- duplicates are skipped.' -ForegroundColor Green
