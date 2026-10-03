# Warehouse OS - repair LAN access after a network change (new router, IP
# change, Windows reclassifying the network as Public). ASCII ONLY.
# Launcher: RUN-NETWORK-FIX.bat  (run as administrator ON the server machine)
#
# The real repair logic ships inside the installation
# (C:\WarehouseOS\scripts\network-fix.ps1); this wrapper just runs it so the
# flash carries one known entry point for every repair.

param(
    [string]$Root = 'C:\WarehouseOS'
)

$ErrorActionPreference = 'Continue'
$fix = Join-Path $Root 'scripts\network-fix.ps1'
if (-not (Test-Path $fix)) {
    Write-Host "network-fix.ps1 not found at $fix" -ForegroundColor Red
    Write-Host 'Is this the server machine? Is the install present?' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host "=== Running the network repair ===" -ForegroundColor Cyan
& $fix -Root $Root
Write-Host ''
Write-Host 'Then test from the seller PC: open http://<server-ip>:3001' -ForegroundColor Cyan
Write-Host ''
