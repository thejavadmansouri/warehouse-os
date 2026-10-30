<#
    Kardo -- start the whole stack out of this folder.

    ASCII ONLY (see install.ps1). Order matters: the API opens a connection pool
    in its first second, so Postgres has to be answering before it starts.
    Everything is a plain child process -- no services -- so the stack dies with
    the machine, not silently outlive a reboot in a broken state.
#>
param(
    [int]$ApiPort = 0,
    [int]$WebPort = 0,
    [int]$DbPort  = 0,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

function Say($m)  { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Step($m) { Write-Host "  $m" }
function Warn($m) { Write-Host "!!! $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host " XX $m" -ForegroundColor Red }

$node    = Join-Path $Root 'runtime\node\node.exe'
$pgBin   = Join-Path $Root 'runtime\pgsql\bin'
$appApi  = Join-Path $Root 'app\api'
$appWeb  = Join-Path $Root 'app\web'
$envFile = Join-Path $Root 'config\.env'
$data    = Join-Path $Root 'data'
$dataDir = Join-Path $data 'pg'
$pids    = Join-Path $data 'pids.json'

if (-not (Test-Path $envFile)) {
    Bad 'config\.env is missing -- this copy is not installed yet. Run install.bat first.'
    exit 1
}

# --------------------------------------------------- settings from config\.env
# The API reads this file itself through WOS_ENV_FILE, but Prisma's CLI and the
# NEXT server take their values from the process environment, so load it here
# too and let every child inherit it.
$settings = @{}
foreach ($line in Get-Content $envFile) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    $k = $t.Substring(0, $i).Trim()
    $v = $t.Substring($i + 1).Trim()
    if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) {
        $v = $v.Substring(1, $v.Length - 2)
    }
    $settings[$k] = $v
}
foreach ($k in $settings.Keys) { Set-Item -Path ("env:" + $k) -Value $settings[$k] }
$env:WOS_ENV_FILE = $envFile

# No ?? here: that operator is PowerShell 7 only, and this has to parse on the
# Windows PowerShell 5.1 that ships with the laptop.
if ($ApiPort -eq 0) {
    $ApiPort = 3000
    if ($settings.ContainsKey('PORT') -and $settings['PORT']) { $ApiPort = [int]$settings['PORT'] }
}
if ($DbPort  -eq 0) {
    if ($settings['DATABASE_URL'] -match '@127\.0\.0\.1:(\d+)/') { $DbPort = [int]$Matches[1] } else { $DbPort = 5433 }
}
if ($WebPort -eq 0) {
    $WebPort = 3001
    if ($settings.ContainsKey('WEB_PORT') -and $settings['WEB_PORT']) { $WebPort = [int]$settings['WEB_PORT'] }
}

Write-Host ''
Write-Host '  Kardo' -ForegroundColor Cyan
Write-Host "  $Root" -ForegroundColor DarkGray

# ------------------------------------------------------------ already running?
function Test-Url([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch { return $false }
}

$apiUp = Test-Url "http://127.0.0.1:$ApiPort/health"
$webUp = Test-Url "http://127.0.0.1:$WebPort/"
if ($apiUp -and $webUp) {
    Warn 'Already running -- nothing to do.'
    if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$WebPort" }
    exit 0
}

# ------------------------------------------------------------------ database
Say 'Database'
& (Join-Path $pgBin 'pg_ctl.exe') status -D $dataDir *> $null
if ($LASTEXITCODE -ne 0) {
    <#
        Never `pg_ctl ... | Out-Null`: postgres.exe is pg_ctl's child and inherits
        the pipe, so PowerShell waits for it to close -- that is, until the
        database is shut down. Redirect to files and poll for readiness below.
    #>
    $pgCtlLog = Join-Path $data 'pgctl-start.log'
    # cmd owns the redirection (see install.ps1): a pipe or Start-Process -Wait
    # would wait for postgres itself, which by design never exits.
    $pgArgs = 'start -D "' + $dataDir + '" -l "' + (Join-Path $data 'db.log') + '" -o "-p ' + $DbPort + '" -w'
    $pgCmd  = '"' + (Join-Path $pgBin 'pg_ctl.exe') + '" ' + $pgArgs + ' > "' + $pgCtlLog + '" 2>&1'
    & cmd.exe /s /c $pgCmd
    if ($LASTEXITCODE -ne 0) {
        Bad "PostgreSQL did not start. See $data\db.log and $pgCtlLog"
        exit 1
    }
    Step "started on port $DbPort"
} else {
    Step "already running on port $DbPort"
}

$ready = $false
foreach ($attempt in 1..30) {
    & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p $DbPort -q
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}

<#
    A postmaster that is listening but cannot spawn children.

    Windows throws this after a hard power-off or a killed process tree:
    "could not reserve shared memory region ... error code 487", and pg_ctl
    status still says "server is running", so a plain start would be skipped and
    the panel would sit there with a database that answers nothing. One restart
    clears it; say so instead of failing silently.
#>
if (-not $ready) {
    Warn 'The database process is up but not answering -- restarting it once'
    $pgCtlLog = Join-Path $data 'pgctl-restart.log'
    $pgArgs = 'restart -D "' + $dataDir + '" -l "' + (Join-Path $data 'db.log') + '" -o "-p ' + $DbPort + '" -w'
    $pgCmd  = '"' + (Join-Path $pgBin 'pg_ctl.exe') + '" ' + $pgArgs + ' > "' + $pgCtlLog + '" 2>&1'
    & cmd.exe /s /c $pgCmd
    foreach ($attempt in 1..30) {
        & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p $DbPort -q
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
}

if (-not $ready) {
    Bad "The database is not answering. See $data\db.log"
    exit 1
}

# ----------------------------------------------------------------------- api
Say 'API'
$apiPid = $null
if (-not $apiUp) {
    $p = Start-Process -FilePath $node -ArgumentList 'dist\src\main.js' `
        -WorkingDirectory $appApi -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $data 'api.log') `
        -RedirectStandardError  (Join-Path $data 'api.err.log')
    $apiPid = $p.Id
    Step "starting (PID $apiPid), log: data\api.log"

    $up = $false
    foreach ($attempt in 1..90) {
        if ($p.HasExited) { break }
        if (Test-Url "http://127.0.0.1:$ApiPort/health") { $up = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $up) {
        Bad "The API did not answer on port $ApiPort."
        Write-Host "  Last lines of data\api.err.log:" -ForegroundColor Yellow
        Get-Content (Join-Path $data 'api.err.log') -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
        Write-Host "  Last lines of data\api.log:" -ForegroundColor Yellow
        Get-Content (Join-Path $data 'api.log') -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
        exit 1
    }
    Step "answering on http://127.0.0.1:$ApiPort"
} else {
    Step 'already answering'
}

# ----------------------------------------------------------------------- web
Say 'Panel'
$webPid = $null
if (-not $webUp) {
    $env:PORT = "$WebPort"
    $env:HOSTNAME = '0.0.0.0'
    $env:NODE_ENV = 'production'
    $p = Start-Process -FilePath $node -ArgumentList 'server.js' `
        -WorkingDirectory $appWeb -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $data 'web.log') `
        -RedirectStandardError  (Join-Path $data 'web.err.log')
    $webPid = $p.Id
    Step "starting (PID $webPid), log: data\web.log"

    $up = $false
    foreach ($attempt in 1..90) {
        if ($p.HasExited) { break }
        if (Test-Url "http://127.0.0.1:$WebPort/") { $up = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $up) {
        Bad "The panel did not answer on port $WebPort."
        Get-Content (Join-Path $data 'web.err.log') -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
        Get-Content (Join-Path $data 'web.log') -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
        exit 1
    }
    Step "answering on http://127.0.0.1:$WebPort"
} else {
    Step 'already answering'
}

# --------------------------------------------------------------------- pids
# Only ids we started are recorded; a stack that was already up keeps whatever
# stop.ps1 wrote before, and stop.ps1 falls back to the ports when this file is
# absent or stale.
if ($apiPid -or $webPid) {
    $prev = @{}
    if (Test-Path $pids) {
        try { (Get-Content $pids -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $prev[$_.Name] = $_.Value } } catch { }
    }
    if ($apiPid) { $prev['api'] = $apiPid }
    if ($webPid) { $prev['web'] = $webPid }
    ($prev | ConvertTo-Json) | Set-Content -Path $pids -Encoding ascii
}

# --------------------------------------------------------------- lan address
function Select-LanIp {
    $a = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
         Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' } |
         Sort-Object -Property PrefixLength |
         Select-Object -First 1
    if ($a) { return $a.IPAddress }
    return '127.0.0.1'
}
$lan = Select-LanIp

Write-Host ''
Write-Host '=======================================================' -ForegroundColor Green
Write-Host '  Kardo is up' -ForegroundColor Green
Write-Host '=======================================================' -ForegroundColor Green
Write-Host "  On this PC:   http://127.0.0.1:$WebPort"
Write-Host "  On the LAN:   http://${lan}:$WebPort"
Write-Host "  API (phones): http://${lan}:$ApiPort"
Write-Host ''
Write-Host '  Stop it with stop.bat (or just shut the laptop down).'

if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$WebPort" }
exit 0
