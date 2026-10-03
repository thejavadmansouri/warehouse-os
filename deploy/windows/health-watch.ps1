<#
    WarehouseOS health watch.

    NSSM restarts a service only when its PROCESS exits. It cannot see a
    process that is alive but not answering: a hung API, an exhausted
    connection pool, or a database that went down while the API kept running.
    The public /health endpoint on the API reports exactly those cases:

        200                 everything is fine
        503 (db: "down")    the API lives, the database does not answer
        no answer at all    the API process is wedged or dead

    Run once a minute from Task Scheduler (SYSTEM account):

        schtasks /Create /F /TN "WarehouseOS Health Watch" /SC MINUTE
            /RU SYSTEM /RL HIGHEST
            /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass
                 -File C:\WarehouseOS\scripts\health-watch.ps1 -Once"

    Or let this script register/remove that task itself:

        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\health-watch.ps1 -Install
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\health-watch.ps1 -Remove

    Without -Once it loops forever with -Interval seconds between passes, so it
    can also be wrapped in its own NSSM service if preferred.

    Recovery policy (one pass):
      - API does not answer          -> restart WarehouseOS-API
      - 503 and DB service stopped   -> start WarehouseOS-DB, wait, recheck
      - 503 and DB service running   -> restart WarehouseOS-API (clears a wedged
                                        connection pool), wait, recheck
      - still bad after both         -> CRITICAL line + data\WATCH-ALERT.txt
      - web port unreachable         -> start or restart WarehouseOS-Web

    A restart thrash guard keeps the last restarts per service in
    data\watch-state.json: 4 or more restarts within 30 minutes means something
    is systematically broken -- restarting more would only churn the logs, so
    the guard skips the restart and leaves an alert file instead.

    All outcomes land in data\watch.log. A healthy hour still gets one
    "heartbeat" line so the log itself can prove the watch ran.

    ASCII ONLY -- see the note at the top of build.ps1.
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001,
    [int]$Interval = 60,
    [switch]$Once,
    [switch]$Install,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$DB  = 'WarehouseOS-DB'
$API = 'WarehouseOS-API'
$WEB = 'WarehouseOS-Web'

$dataDir    = Join-Path $Root 'data'
$watchLog   = Join-Path $dataDir 'watch.log'
$stateFile  = Join-Path $dataDir 'watch-state.json'
$alertFile  = Join-Path $dataDir 'WATCH-ALERT.txt'
$nssm       = Join-Path $Root 'nssm.exe'

# --------------------------------------------------------------- utilities

function Write-WatchLog([string]$level, [string]$message) {
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }

    # Rotate: one old copy is enough. These files are read by humans at 2am.
    if ((Test-Path $watchLog) -and ((Get-Item $watchLog).Length -gt 1MB)) {
        Move-Item $watchLog ($watchLog + '.old') -Force
    }

    $line = ('{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $level, $message)
    Add-Content -Path $watchLog -Value $line
}

function Load-State {
    if (-not (Test-Path $stateFile)) {
        return @{ apiRestarts = @(); webRestarts = @(); lastState = ''; lastHeartbeat = 0; lastAlert = 0 }
    }
    try {
        $s = Get-Content $stateFile -Raw | ConvertFrom-Json
        if ($null -eq $s.apiRestarts)  { $s | Add-Member -NotePropertyName apiRestarts  -NotePropertyValue @() }
        if ($null -eq $s.webRestarts)  { $s | Add-Member -NotePropertyName webRestarts  -NotePropertyValue @() }
        if ($null -eq $s.lastState)    { $s | Add-Member -NotePropertyName lastState    -NotePropertyValue '' }
        if ($null -eq $s.lastHeartbeat){ $s | Add-Member -NotePropertyName lastHeartbeat -NotePropertyValue 0 }
        if ($null -eq $s.lastAlert)    { $s | Add-Member -NotePropertyName lastAlert    -NotePropertyValue 0 }
        return $s
    } catch {
        # A corrupt state file must never block monitoring. Start clean.
        Write-WatchLog 'WARN' ('state file unreadable, starting clean: ' + $_.Exception.Message)
        return @{ apiRestarts = @(); webRestarts = @(); lastState = ''; lastHeartbeat = 0; lastAlert = 0 }
    }
}

function Save-State($s) {
    $s | ConvertTo-Json -Depth 3 | Set-Content -Path $stateFile -Encoding ascii
}

# 4+ restarts of one service inside 30 minutes = a systematic failure. More
# restarts would only churn; the guard skips them and raises the alert instead.
function Restart-IsAllowed([string[]]$history) {
    $now      = [DateTime]::UtcNow
    $cutoff   = $now.AddMinutes(-30).ToFileTime()
    $recent   = @($history | Where-Object { $_ -ge $cutoff })
    return ($recent.Count -lt 4)
}

function Record-Restart($state, [string]$which) {
    $stamp = [DateTime]::UtcNow.ToFileTime()
    if ($which -eq $API) { $state.apiRestarts = @($state.apiRestarts + $stamp) }
    else                 { $state.webRestarts = @($state.webRestarts + $stamp) }
}

function Raise-Alert($state, [string]$message) {
    Write-WatchLog 'CRITICAL' $message
    $now = [DateTime]::UtcNow.ToFileTime()
    if ($now - $state.lastAlert -gt 36000000000) {   # one hour between alert writes
        $body = 'WarehouseOS is unhealthy. Details: ' + $message + '. Log: ' + $watchLog
        Set-Content -Path $alertFile -Value $body -Encoding ascii
        $state.lastAlert = $now
    }
}

# --------------------------------------------------------------- actions

function Service-Exists([string]$name) {
    return ($null -ne (Get-Service $name -ErrorAction SilentlyContinue))
}

function Control-Service([string]$action, [string]$name) {
    if (-not (Service-Exists $name)) {
        Write-WatchLog 'WARN' ($name + ' service is not installed; nothing to ' + $action.ToLower())
        return $false
    }
    if (-not (Test-Path $nssm)) {
        Write-WatchLog 'WARN' ('nssm.exe not found at ' + $nssm + '; cannot control ' + $name)
        return $false
    }
    & $nssm $action $name 2>&1 | Out-Null
    Write-WatchLog 'INFO' ($action + ' ' + $name + ' issued')
    return $true
}

function Check-WebPort {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $WebPort)
        if (-not $task.Wait(3000)) { return $false }
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Invoke-HealthCheck {
    # Returns a hashtable: { ok: bool, kind: 'GOOD'|'DBDOWN'|'WEDGE', dbLatencyMs: int }
    try {
        $resp = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $ApiPort + '/health') `
            -UseBasicParsing -TimeoutSec 5
        $body = $resp.Content | ConvertFrom-Json
        if ($resp.StatusCode -eq 200 -and $body.db -eq 'up') {
            return @{ ok = $true; kind = 'GOOD'; dbLatencyMs = [int]$body.dbLatencyMs }
        }
        # 200 without db up should not happen; treat it as a DB problem anyway.
        return @{ ok = $false; kind = 'DBDOWN'; dbLatencyMs = 0 }
    } catch {
        $response = $_.Exception.Response
        if ($null -ne $response) {
            $code = [int]$response.StatusCode
            if ($code -eq 503) {
                return @{ ok = $false; kind = 'DBDOWN'; dbLatencyMs = 0 }
            }
            # Any other HTTP answer still proves the process is alive and
            # routing; that alone is better than silence, but not healthy.
            return @{ ok = $false; kind = 'WEDGE'; dbLatencyMs = 0 }
        }
        # No HTTP answer at all: timeout or connection refused.
        return @{ ok = $false; kind = 'WEDGE'; dbLatencyMs = 0 }
    }
}

function Wait-Healthy([int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        $h = Invoke-HealthCheck
        if ($h.ok) { return $true }
    }
    return $false
}

# --------------------------------------------------------------- one pass

function Run-Pass {
    $state = Load-State

    $h = Invoke-HealthCheck

    if ($h.ok) {
        if ($state.lastState -ne 'GOOD') {
            Write-WatchLog 'INFO' ('API healthy again (db ' + $h.dbLatencyMs + 'ms)')
        }
        $state.lastState = 'GOOD'

        # One heartbeat per hour: proves the watch itself is alive.
        $now = [DateTime]::UtcNow.ToFileTime()
        if ($now - $state.lastHeartbeat -gt 36000000000) {
            Write-WatchLog 'INFO' ('heartbeat: ok, db ' + $h.dbLatencyMs + 'ms')
            $state.lastHeartbeat = $now
            if (Test-Path $alertFile) { Remove-Item $alertFile -ErrorAction SilentlyContinue }
        }
        Save-State $state
    }
    elseif ($h.kind -eq 'WEDGE') {
        # The API process is alive-or-dead but not answering. A restart is the
        # only remedy NSSM did not apply because the process may not have exited.
        Write-WatchLog 'ERROR' 'API not answering on /health'
        if (Restart-IsAllowed $state.apiRestarts) {
            if (Control-Service 'restart' $API) { Record-Restart $state $API }
            if (-not (Wait-Healthy 40)) {
                Raise-Alert $state ('API restart did not restore /health on port ' + $ApiPort)
            }
        } else {
            Raise-Alert $state 'API keeps failing; restart guard is holding'
        }
        $state.lastState = 'BAD'
        Save-State $state
    }
    else {
        # DBDOWN: the API answers, the database does not.
        Write-WatchLog 'ERROR' 'API alive but database is down (503)'

        $dbStatus = (Get-Service $DB -ErrorAction SilentlyContinue).Status
        if ($dbStatus -and $dbStatus -ne 'Running') {
            Control-Service 'start' $DB
            Start-Sleep -Seconds 20
        }

        if (-not (Wait-Healthy 40)) {
            # The database answers nothing, or the API holds a wedged pool that
            # never reconnects. One API restart clears that pool.
            if (Restart-IsAllowed $state.apiRestarts) {
                if (Control-Service 'restart' $API) { Record-Restart $state $API }
                if (-not (Wait-Healthy 40)) {
                    Raise-Alert $state 'Database is down and an API restart did not help'
                }
            } else {
                Raise-Alert $state 'Database is down; restart guard is holding'
            }
        } else {
            Write-WatchLog 'INFO' 'database recovered after service action'
        }
        $state.lastState = 'BAD'
        Save-State $state
    }

    # The web panel is a static file server; a plain TCP probe is enough.
    if (-not (Check-WebPort)) {
        Write-WatchLog 'ERROR' ('web panel not answering on port ' + $WebPort)
        $webStatus = (Get-Service $WEB -ErrorAction SilentlyContinue).Status
        if ($webStatus -and $webStatus -ne 'Running') {
            Control-Service 'start' $WEB
        } elseif (Restart-IsAllowed $state.webRestarts) {
            if (Control-Service 'restart' $WEB) { Record-Restart $state $WEB }
        } else {
            Raise-Alert $state 'Web panel keeps failing; restart guard is holding'
        }
    }
}

# --------------------------------------------------------------- task mgmt

if ($Install) {
    $tr = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Once'
    & schtasks /Create /F /TN 'WarehouseOS Health Watch' /SC MINUTE /RU SYSTEM /RL HIGHEST /TR $tr
    if ($LASTEXITCODE -ne 0) { throw 'schtasks could not create the task' }
    Write-Host 'Task "WarehouseOS Health Watch" registered (every minute, SYSTEM).'
    return
}

if ($Remove) {
    & schtasks /Delete /F /TN 'WarehouseOS Health Watch'
    if ($LASTEXITCODE -ne 0) { Write-Host 'Task not found (nothing removed).' }
    else { Write-Host 'Task "WarehouseOS Health Watch" removed.' }
    return
}

if ($Once) {
    Run-Pass
    return
}

while ($true) {
    Run-Pass
    Start-Sleep -Seconds $Interval
}
