<#
    کاردو — بارگذاری دادهٔ نمایشی روی نصبِ کیت.

    ASCII ONLY: Windows PowerShell 5.1 reads .ps1 with the system codepage, so a
    Persian comment here would break the file on the laptop that matters.

    چه می‌کند:
      1. پوشهٔ نصبِ کیت را پیدا می‌کند (همان که runtime\node\node.exe دارد).
      2. رمز مدیر و پورت‌ها را از config\.env همان نصب می‌خواند.
      3. اگر سرور بالا نباشد، start.ps1 را صدا می‌زند و منتظر می‌ماند.
      4. import.mjs را با همان node داخل کیت اجرا می‌کند (هیچ نصبی لازم نیست).
#>
param(
    [string]$Kit = '',
    [string]$Password = '',
    [string]$Profile = 'full',
    [switch]$SkipOpen
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

function Say($m)  { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !!  $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  XX  $m" -ForegroundColor Red }

function Test-Kit([string]$dir) {
    if (-not $dir) { return $false }
    return (Test-Path (Join-Path $dir 'runtime\node\node.exe')) -and (Test-Path (Join-Path $dir 'config\.env'))
}

function Find-Kit {
    $candidates = New-Object System.Collections.ArrayList
    if ($env:KARDO_HOME) { [void]$candidates.Add($env:KARDO_HOME) }
    # اگر همین پوشه داخلِ کیت گذاشته شده باشد
    [void]$candidates.Add((Join-Path $here '..'))
    [void]$candidates.Add((Join-Path $here '..\..'))
    # جای‌های معمول
    $desktop = [Environment]::GetFolderPath('Desktop')
    foreach ($d in @($desktop, $env:USERPROFILE, 'C:\', 'D:\')) {
        if (-not (Test-Path $d)) { continue }
        Get-ChildItem -Path $d -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like 'kardo-kit*' -or $_.Name -eq 'Kardo' -or $_.Name -eq 'kardo' } |
            ForEach-Object { [void]$candidates.Add($_.FullName) }
    }
    [void]$candidates.Add('C:\WarehouseOS')

    foreach ($c in $candidates) {
        $full = (Resolve-Path $c -ErrorAction SilentlyContinue)
        if ($full -and (Test-Kit $full.Path)) { return $full.Path }
    }
    return $null
}

Write-Host ''
Write-Host '  Kardo - demo data' -ForegroundColor Cyan

# ---------------------------------------------------------------- find kit
if (-not $Kit) { $Kit = Find-Kit }
if (-not (Test-Kit $Kit)) {
    Bad 'The Kardo install folder was not found.'
    Write-Host ''
    Write-Host '  Drag the Kardo folder (the one holding runtime, app, config)'
    Write-Host '  onto this window and press Enter, or type its path:'
    $typed = Read-Host '  Kit folder'
    $typed = $typed.Trim('"').Trim()
    if (-not (Test-Kit $typed)) {
        Bad "Not a Kardo install: $typed"
        Read-Host 'Press Enter to close'
        exit 1
    }
    $Kit = (Resolve-Path $typed).Path
}
Ok "kit: $Kit"

$node    = Join-Path $Kit 'runtime\node\node.exe'
$psql    = Join-Path $Kit 'runtime\pgsql\bin\psql.exe'
$envFile = Join-Path $Kit 'config\.env'

# ------------------------------------------------------------ config\.env
function Read-Env([string]$name) {
    $line = (Get-Content $envFile -Encoding ASCII | Where-Object { $_ -match "^$name=" } | Select-Object -First 1)
    if (-not $line) { return '' }
    $v = $line.Substring($line.IndexOf('=') + 1).Trim()
    if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
    return $v
}

$apiPort = Read-Env 'PORT'
if (-not $apiPort) { $apiPort = '3000' }
$webPort = Read-Env 'WEB_PORT'
if (-not $webPort) { $webPort = '3001' }
$dbUrl   = Read-Env 'DATABASE_URL'
$adminPw = Read-Env 'ADMIN_INITIAL_PASSWORD'
$api = "http://127.0.0.1:$apiPort"
Ok "api: $api"

if (-not $Password) { $Password = $adminPw }

# ------------------------------------------------------------- is it up?
function Test-Url([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch { return $false }
}

if (-not (Test-Url "$api/health")) {
    Say 'Kardo is not running - starting it'
    $startScript = Join-Path $Kit 'start.ps1'
    if (-not (Test-Path $startScript)) {
        Bad "start.ps1 is missing from $Kit"
        Read-Host 'Press Enter to close'
        exit 1
    }
    & $startScript -NoBrowser
    $up = $false
    foreach ($i in 1..120) {
        if (Test-Url "$api/health") { $up = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $up) {
        Bad 'The server did not come up. Check data\api.log inside the kit.'
        Read-Host 'Press Enter to close'
        exit 1
    }
}
Ok 'server is answering'

# --------------------------------------------------------------- password
function Test-Login([string]$pw) {
    if (-not $pw) { return $false }
    try {
        $body = @{ username = 'admin'; password = $pw } | ConvertTo-Json
        $r = Invoke-WebRequest -Uri "$api/auth/login" -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 10
        return ($r.StatusCode -eq 200 -or $r.StatusCode -eq 201)
    } catch { return $false }
}

if (-not (Test-Login $Password)) {
    Warn 'The admin password in config\.env does not work (it may have been changed in the panel).'
    $secure = Read-Host '  Admin password' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if (-not (Test-Login $Password)) {
        Bad 'Login failed with that password too.'
        Read-Host 'Press Enter to close'
        exit 1
    }
}
Ok 'admin login works'

# ------------------------------------------------------------------ run
Say "Loading demo data (profile: $Profile)"
$importArgs = @(
    (Join-Path $here 'import.mjs'),
    "--api=$api",
    "--password=$Password",
    "--profile=$Profile"
)
if (Test-Path $psql) { $importArgs += "--psql=$psql" }
if ($dbUrl) { $importArgs += "--database-url=$dbUrl" }
if ($env:KARDO_SKIP_BACKDATE -eq '1') { $importArgs += '--skip-backdate' }

& $node @importArgs
$code = $LASTEXITCODE

Write-Host ''
if ($code -ne 0) {
    Bad "Import stopped with code $code. Nothing is lost - see the message above."
    Read-Host 'Press Enter to close'
    exit $code
}

Ok 'Demo data is in'
if (-not $SkipOpen) { Start-Process "http://127.0.0.1:$webPort" }
Write-Host ''
Write-Host '  Open the panel and log in with admin, or with a demo user:'
Write-Host '    seller1 / demo1234      (sales)'
Write-Host '    manager / demo1234      (manager)'
Write-Host '    anbardar1 / demo1234    (warehouse)'
Write-Host ''
Read-Host 'Press Enter to close'
