<#
    Register the three Windows services.

    ASCII ONLY -- see the note at the top of build.ps1.

    Kept separate from first-run so an update can call it too: after the `app`
    folder is replaced the services need redefining without touching the
    database or the configuration.

    The dependency order matters. If the API starts before the database is up it
    dies on a connection error at boot, which is exactly the morning after a
    power cut.
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001,
    # first-run needs the database up before the API has anything to connect to.
    [switch]$DbOnly
)

$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }

$nssm    = Join-Path $Root 'nssm.exe'
$node    = Join-Path $Root 'app\node\node.exe'
$envFile = Join-Path $Root 'config\.env'
$logDir  = Join-Path $Root 'data'

$DB  = 'WarehouseOS-DB'
$API = 'WarehouseOS-API'
$WEB = 'WarehouseOS-Web'

<#
    PostgreSQL refuses to run under an administrative account on Windows.

    check_root() in the server calls pgwin32_is_admin() and exits with
    "Execution of PostgreSQL by a user with administrative permissions is not
    permitted". NSSM's default service account is LocalSystem, which is a member
    of Administrators -- so the database service would install cleanly and then
    never start.

    NetworkService is a built-in low-privilege account, is in neither
    Administrators nor Power Users, and needs no password to store anywhere. The
    data directory is granted to it in first-run.ps1.
#>
$DB_ACCOUNT = 'NT AUTHORITY\NetworkService'

# Fail here, with the path in the message, rather than registering services that
# point at files that do not exist and only fail at boot.
$required = @($nssm, (Join-Path $Root 'pgsql\bin\postgres.exe'))
if (-not $DbOnly) {
    $required += @($node,
                   (Join-Path $Root 'app\api\dist\src\main.js'),
                   (Join-Path $Root 'app\web\server.js'))
}
foreach ($path in $required) {
    if (-not (Test-Path $path)) { throw "Missing file, cannot register services: $path" }
}

function Remove-Svc($name) {
    & $nssm stop $name  2>$null | Out-Null
    & $nssm remove $name confirm 2>$null | Out-Null
}

Say 'Removing previous services (if any)'
if (-not $DbOnly) { Remove-Svc $WEB; Remove-Svc $API }
Remove-Svc $DB

Say 'Registering the database service'
& $nssm install $DB (Join-Path $Root 'pgsql\bin\postgres.exe') `
    "-D" (Join-Path $Root 'data\pg') | Out-Null
& $nssm set $DB DisplayName 'Warehouse OS - Database' | Out-Null
& $nssm set $DB ObjectName $DB_ACCOUNT | Out-Null
& $nssm set $DB Start SERVICE_AUTO_START | Out-Null
& $nssm set $DB AppStdout (Join-Path $logDir 'db.log') | Out-Null
& $nssm set $DB AppStderr (Join-Path $logDir 'db.log') | Out-Null
# Rotate the logs, or the disk fills up after a few months and takes the
# database down with it.
& $nssm set $DB AppRotateFiles 1 | Out-Null
& $nssm set $DB AppRotateBytes 10485760 | Out-Null

if ($DbOnly) {
    Say 'Starting the database service'
    & $nssm start $DB | Out-Null
    Start-Sleep -Seconds 3
    $state = (Get-Service $DB -ErrorAction SilentlyContinue).Status
    Write-Host ("  {0,-20} {1}" -f $DB, $state)
    if ($state -ne 'Running') {
        throw "The database service did not start. See $logDir\db.log"
    }
    return
}

Say 'Registering the API service'
& $nssm install $API $node (Join-Path $Root 'app\api\dist\src\main.js') | Out-Null
& $nssm set $API DisplayName 'Warehouse OS - API' | Out-Null
& $nssm set $API AppDirectory (Join-Path $Root 'app\api') | Out-Null
# Configuration is read from the config folder, not from next to the code, so
# an update cannot delete it.
& $nssm set $API AppEnvironmentExtra "WOS_ENV_FILE=$envFile" "PORT=$ApiPort" | Out-Null
& $nssm set $API Start SERVICE_AUTO_START | Out-Null
& $nssm set $API DependOnService $DB | Out-Null
& $nssm set $API AppStdout (Join-Path $logDir 'api.log') | Out-Null
& $nssm set $API AppStderr (Join-Path $logDir 'api.log') | Out-Null
& $nssm set $API AppRotateFiles 1 | Out-Null
& $nssm set $API AppRotateBytes 10485760 | Out-Null
# The database takes a few seconds after its service reports started; give the
# API room to retry instead of giving up.
& $nssm set $API AppThrottle 5000 | Out-Null
& $nssm set $API AppRestartDelay 5000 | Out-Null

Say 'Registering the web panel service'
& $nssm install $WEB $node (Join-Path $Root 'app\web\server.js') | Out-Null
& $nssm set $WEB DisplayName 'Warehouse OS - Panel' | Out-Null
& $nssm set $WEB AppDirectory (Join-Path $Root 'app\web') | Out-Null
# HOSTNAME=0.0.0.0 is required, otherwise Next listens on localhost only and the
# seller PC and the phones cannot connect.
& $nssm set $WEB AppEnvironmentExtra "PORT=$WebPort" "HOSTNAME=0.0.0.0" | Out-Null
& $nssm set $WEB Start SERVICE_AUTO_START | Out-Null
& $nssm set $WEB DependOnService $API | Out-Null
& $nssm set $WEB AppStdout (Join-Path $logDir 'web.log') | Out-Null
& $nssm set $WEB AppStderr (Join-Path $logDir 'web.log') | Out-Null
& $nssm set $WEB AppRotateFiles 1 | Out-Null
& $nssm set $WEB AppRotateBytes 10485760 | Out-Null

Say 'Starting the services'
& $nssm start $DB  | Out-Null
Start-Sleep -Seconds 5
& $nssm start $API | Out-Null
Start-Sleep -Seconds 5
& $nssm start $WEB | Out-Null
Start-Sleep -Seconds 3

$failed = @()
foreach ($s in @($DB, $API, $WEB)) {
    $state = (Get-Service $s -ErrorAction SilentlyContinue).Status
    if ($state -eq 'Running') {
        $ok = 'OK'
    } else {
        $ok = 'FAILED'
        $failed += $s
    }
    Write-Host ("  {0,-20} {1,-10} {2}" -f $s, $state, $ok)
}

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host ("Not running: {0}. Check the logs in {1}" -f ($failed -join ', '), $logDir) -ForegroundColor Red
}
