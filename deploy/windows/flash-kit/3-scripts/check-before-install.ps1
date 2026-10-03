# Warehouse OS - pre-install check. Run this ON the shop machine BEFORE Setup.
# ASCII ONLY -- PowerShell 5.1 reads .ps1 with the system codepage.
# Double-click launcher: RUN-CHECK-BEFORE-INSTALL.bat

$ErrorActionPreference = 'Continue'
function Line { param($ok, $msg) if ($ok) { Write-Host "  [OK]  $msg" -ForegroundColor Green } else { Write-Host "  [!!]  $msg" -ForegroundColor Red } }

Write-Host ''
Write-Host '=== Warehouse OS -- pre-install check ===' -ForegroundColor Cyan

# 1. Admin rights (Setup and the repair scripts need them)
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Line $isAdmin 'Administrator rights (right-click -> Run as administrator)'
if (-not $isAdmin) {
    Write-Host '        ^ without this the install cannot register services.' -ForegroundColor Yellow
}

# 2. Windows version (Windows 10 or newer)
$os = Get-CimInstance Win32_OperatingSystem
$ver = [Version]$os.Version
Line ($ver.Major -ge 10) ("Windows version: {0} {1} (build {2})" -f $os.Caption, $os.Version, $os.BuildNumber)

# 3. Free space on C: (install + database + backups grow over the years)
$c = Get-PSDrive C
$freeGb = [math]::Round($c.Free / 1GB, 1)
Line ($freeGb -ge 10) ("Free space on C: {0} GB (need at least 10)" -f $freeGb)

# 4. Ports 3000 / 3001 / 5432 must be free (or owned by an existing WarehouseOS install)
$occupied = @()
foreach ($p in 3000, 3001, 5432) {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($c) { $occupied += $p }
}
if ($occupied.Count -eq 0) {
    Line $true 'Ports 3000 / 3001 / 5432 are free'
} else {
    $svc = Get-Service 'WarehouseOS-DB' -ErrorAction SilentlyContinue
    if ($svc) {
        Line $true ("Ports in use by an existing Warehouse OS install: {0} (fine -- this is a reinstall/update)" -f ($occupied -join ', '))
    } else {
        Line $false ("Ports ALREADY IN USE by other software: {0} -- that software must be stopped or moved, or the install will fail." -f ($occupied -join ', '))
    }
}

# 5. WebView2 (the seller shell's only runtime dependency)
$wv2 = Get-ItemProperty `
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', `
    'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' `
    -ErrorAction SilentlyContinue
if ($wv2) {
    Line $true ("WebView2 Runtime present (version {0})" -f $wv2.pv)
} else {
    Line $false 'WebView2 Runtime NOT found. The POS app would open empty. Update Edge/Windows or install WebView2 from: https://go.microsoft.com/fwlink/?linkid=2124701 (needs internet ONCE).'
}

Write-Host ''
Write-Host 'If everything above is [OK], run 1-install\WarehouseOS-Setup-0.4.0.exe as administrator.' -ForegroundColor Cyan
Write-Host 'Details for any [!!] line: 2-guides\troubleshoot.html' -ForegroundColor Cyan
