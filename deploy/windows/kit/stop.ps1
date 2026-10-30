<#
    Kardo -- stop the stack in this folder.

    Stops only what this copy started: recorded PIDs first, then a command-line
    match under this folder as a fallback (a stale pids.json after a reboot).
    Never a broad "kill every node.exe" -- the same laptop may be running other
    Node things, and on the build machine it certainly is.
#>
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

function Step($m) { Write-Host "  $m" }
function Warn($m) { Write-Host "!!! $m" -ForegroundColor Yellow }

$pgBin   = Join-Path $Root 'runtime\pgsql\bin'
$data    = Join-Path $Root 'data'
$dataDir = Join-Path $data 'pg'
$pids    = Join-Path $data 'pids.json'

Write-Host ''
Write-Host '  Kardo -- stopping' -ForegroundColor Cyan

# --------------------------------------------------------------- app servers
$killed = 0
if (Test-Path $pids) {
    try {
        $recorded = Get-Content $pids -Raw | ConvertFrom-Json
        foreach ($name in @('api', 'web')) {
            $id = $recorded.$name
            if (-not $id) { continue }
            $p = Get-Process -Id $id -ErrorAction SilentlyContinue
            if ($p -and $p.ProcessName -eq 'node') {
                Stop-Process -Id $id -Force
                Step "stopped $name (PID $id)"
                $killed++
            }
        }
    } catch {
        Warn "data\pids.json could not be read: $($_.Exception.Message)"
    }
}

# Anything left that is running *from this folder* (an install started by a
# previous session, or a recorded PID that has since been reused).
$left = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
          Where-Object { $_.CommandLine -and $_.CommandLine -like ('*' + $Root + '*') })
foreach ($proc in $left) {
    try {
        Stop-Process -Id $proc.ProcessId -Force
        Step "stopped node (PID $($proc.ProcessId))"
        $killed++
    } catch {
        Warn "could not stop PID $($proc.ProcessId): $($_.Exception.Message)"
    }
}
if ($killed -eq 0) { Step 'no Kardo app process was running' }
Remove-Item $pids -Force -ErrorAction SilentlyContinue

# ------------------------------------------------------------------ database
& (Join-Path $pgBin 'pg_ctl.exe') status -D $dataDir *> $null
if ($LASTEXITCODE -eq 0) {
    # No pipe on pg_ctl, same reason as start.ps1: its children inherit it.
    # A file per action, not one shared pgctl.log: postgres.exe inherits the
    # handle cmd opened for `pg_ctl start` and holds it for its whole life, so
    # reusing that name here fails with "used by another process" -- and the
    # server then quietly stayed up.
    $pgCtlLog = Join-Path $data 'pgctl-stop.log'
    # cmd owns the redirection (see install.ps1); quotes survive as written.
    $pgArgs = 'stop -D "' + $dataDir + '" -m fast -w'
    $pgCmd  = '"' + (Join-Path $pgBin 'pg_ctl.exe') + '" ' + $pgArgs + ' > "' + $pgCtlLog + '" 2>&1'
    & cmd.exe /s /c $pgCmd
    if ($LASTEXITCODE -eq 0) {
        Step 'database stopped'
    } else {
        Warn "The database did not stop cleanly. See $data\db.log"
    }
} else {
    Step 'database was not running'
}

Write-Host ''
Write-Host '  Kardo is stopped.' -ForegroundColor Green
Write-Host '  Your data is in data\pg -- nothing was deleted.'
exit 0
