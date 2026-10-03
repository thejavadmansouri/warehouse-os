# Warehouse OS - install the server-status tray for the operator.
# ASCII ONLY. Launcher: INSTALL-STATUS-TOOL.bat (self-elevates).
# Requires the Warehouse OS install to exist (nssm/C:\WarehouseOS).

param(
    [string]$Root = 'C:\WarehouseOS'
)

$ErrorActionPreference = 'Continue'
Write-Host ''
Write-Host '=== Installing the server status icon ===' -ForegroundColor Cyan

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Run as administrator (the launcher does this by itself).' -ForegroundColor Red
    exit 1
}

# 1. Copy the app next to the other install scripts, so it survives without
#    the flash and future updates can refresh it.
$src = Join-Path $PSScriptRoot 'server-status.ps1'
$dst = Join-Path $Root 'scripts\server-status.ps1'
if (-not (Test-Path $src)) { Write-Host "server-status.ps1 not found at $src" -ForegroundColor Red; exit 1 }
Copy-Item $src $dst -Force
Write-Host "  installed: $dst"

# 2. Desktop shortcut: one double-click opens the status window.
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Warehouse OS Status.lnk'))
$lnk.TargetPath   = 'powershell.exe'
$lnk.Arguments    = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dst`""
$sellerExe = Join-Path $Root 'app\desktop\warehouse-seller.exe'
if (Test-Path $sellerExe) { $lnk.IconLocation = "$sellerExe,0" }
$lnk.Description  = 'Warehouse OS status'
$lnk.Save()
Write-Host '  desktop shortcut: Warehouse OS Status'

# 3. Auto-start at login, already elevated, WITHOUT a UAC prompt each time --
#    that elevation is what lets the app start stopped services by itself.
$taskName = 'WarehouseOS Status Tray'
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
             -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dst`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -RunLevel Highest -Force | Out-Null
Write-Host "  scheduled task: $taskName (starts at login)"

# 4. Start it right now so the operator sees the icon immediately.
Start-Process powershell.exe -WindowStyle Hidden `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$dst`""
Write-Host '  started now - look for the green/red dot near the clock.'

Write-Host ''
Write-Host 'Done. Green dot = server up. Right-click it for details and repair.' -ForegroundColor Green
Start-Sleep -Seconds 3
