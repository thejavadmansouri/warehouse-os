# Warehouse OS - install the FIXED services.ps1 over the one shipped in
# Setup 0.3.3. ASCII ONLY. Launcher: RUN-PATCH-SERVICES-SCRIPT.bat
# (run as administrator, AFTER the Setup finished).
#
# Why: PowerShell 5.1 turns any native stderr line into a terminating error
# while ErrorActionPreference is Stop, and nssm reports even its successes on
# stderr. The services.ps1 inside 0.3.3 can therefore die at "Removing
# previous services" during an UPDATE or a repair (never on a fresh install).
# The copy on this flash is the corrected version (EAP dropped to Continue
# around the nssm calls, database always stopped last). Setup 0.3.4+ makes
# this patch unnecessary.

param(
    [string]$Root = 'C:\WarehouseOS'
)

$ErrorActionPreference = 'Continue'
$src  = Join-Path $PSScriptRoot 'services-fixed.ps1'
$dest = Join-Path $Root 'scripts\services.ps1'

Write-Host ''
Write-Host '=== Patching the installed services.ps1 ===' -ForegroundColor Cyan

if (-not (Test-Path $dest)) {
    Write-Host "No installation at $dest -- run Setup first." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $src)) {
    Write-Host "Fixed script not found at $src" -ForegroundColor Red
    exit 1
}

Copy-Item $src $dest -Force
Write-Host ("  patched: {0}" -f $dest) -ForegroundColor Green

# Show the fingerprint so the operator can see the patch took.
$hash = (Get-FileHash -Path $dest -Algorithm SHA256).Hash.Substring(0, 12)
Write-Host ("  services.ps1 SHA256 now starts with: {0}" -f $hash)
Write-Host ''
Write-Host 'Done. This only matters for future updates/repairs; running services are untouched.' -ForegroundColor Cyan
Write-Host ''
