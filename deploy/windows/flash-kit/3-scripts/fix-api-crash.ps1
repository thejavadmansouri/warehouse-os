# Warehouse OS - repair the API crash loop: "JWT_SECRET is not set".
# ASCII ONLY. Launcher: RUN-FIX-API-CRASH.bat  (run as administrator)
#
# What this fixes (both known causes of the crash loop):
#   1. config\.env lost its JWT_SECRET / DATABASE_URL (or the file is gone).
#      -> Regenerates JWT_SECRET. If the DB password is also lost, resets it
#         via a temporary pg_hba "trust" window and rebuilds the file.
#   2. The API service lost its WOS_ENV_FILE / PORT environment variables
#      (happens when a service re-registration dies midway).
#      -> Re-sets them and restarts the service.
# It does NOT touch your data, invoices, or the database contents.

param(
    [string]$Root = 'C:\WarehouseOS'
)

$ErrorActionPreference = 'Stop'
$API  = 'WarehouseOS-API'
$WEB  = 'WarehouseOS-Web'
$DB   = 'WarehouseOS-DB'
$nssm    = Join-Path $Root 'nssm.exe'
$node    = Join-Path $Root 'app\node\node.exe'
$envFile = Join-Path $Root 'config\.env'
$pgBin   = Join-Path $Root 'pgsql\bin'
$psql    = Join-Path $pgBin 'psql.exe'
$dataDir = Join-Path $Root 'pgdata'
$health  = 'http://localhost:3000/health'

function Say { param($m) Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function OK  { param($m) Write-Host "  [OK]  $m" -ForegroundColor Green }
function Bad { param($m) Write-Host "  [!!]  $m" -ForegroundColor Red }
function Step { param($m) Write-Host "  ...   $m" }

function New-Secret {
    param([int]$bytes)
    $b = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','x').Replace('/','y')
}

# nssm reports success on stderr; PS 5.1 turns that into a terminating error
# when ErrorActionPreference is Stop. Same guard as services.ps1.
function Nssm {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $nssm @args 2>&1 | Out-Null; return $LASTEXITCODE }
    finally { $ErrorActionPreference = $eap }
}
function NssmGet {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { return (& $nssm @args 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $eap }
}

Say 'Preflight'
foreach ($f in @($nssm, $node, (Join-Path $Root 'app\api\dist\src\main.js'))) {
    if (-not (Test-Path $f)) { Bad "Missing: $f -- run this from an installed machine"; exit 1 }
}
OK "Installation found at $Root"

# ---------------------------------------------------------------- read env
$jwt = $null; $dbUrl = $null
if (Test-Path $envFile) {
    foreach ($line in (Get-Content $envFile)) {
        if     ($line -match '^\s*JWT_SECRET="?([^"\r]+)') { $jwt   = $Matches[1] }
        elseif ($line -match '^\s*DATABASE_URL="?([^"\r]+)') { $dbUrl = $Matches[1] }
    }
    if ($jwt)   { OK  'config\.env has JWT_SECRET' }   else { Bad 'config\.env has NO JWT_SECRET' }
    if ($dbUrl) { OK  'config\.env has DATABASE_URL' } else { Bad 'config\.env has NO DATABASE_URL' }
} else {
    Bad 'config\.env is MISSING entirely -- will rebuild it'
}

# ------------------------------------------------- rebuild via trust window
if (-not $dbUrl) {
    Say 'Recovering the database password (temporary trust window)'
    if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
        Bad "No database at $dataDir -- wrong Root?"; exit 1
    }
    $hba     = Join-Path $dataDir 'pg_hba.conf'
    $hbaBak  = "$hba.wos-fix-bak"
    Copy-Item $hba $hbaBak -Force
    Step 'Opening trust mode in pg_hba.conf'
    $hbaText = (Get-Content $hba -Raw) -replace 'scram-sha-256','trust' -replace '\bmd5\b','trust'
    Set-Content -Path $hba -Value $hbaText -Encoding ascii

    Step 'Restarting the database service'
    Nssm restart $DB
    $up = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        $r = & $psql -U postgres -h localhost -p 5432 -d postgres -c 'SELECT 1;' 2>&1
        $ErrorActionPreference = $eap
        if ($LASTEXITCODE -eq 0) { $up = $true; break }
    }
    if (-not $up) {
        Copy-Item $hbaBak $hba -Force
        Nssm restart $DB
        Bad 'Database did not come back in trust mode -- send api.log to support'
        exit 1
    }
    OK 'Database is up in trust mode'

    $newPw = New-Secret 24
    Step 'Setting a new postgres password'
    & $psql -U postgres -h localhost -p 5432 -d postgres `
        -c "ALTER USER postgres PASSWORD '$newPw';" | Out-Null
    if ($LASTEXITCODE -ne 0) { Bad 'ALTER USER failed'; exit 1 }

    Step 'Closing trust mode (restoring pg_hba.conf)'
    Copy-Item $hbaBak $hba -Force
    Nssm restart $DB
    Start-Sleep -Seconds 3
    $dbUrl = "postgresql://postgres:$newPw@localhost:5432/warehouse_os?schema=public"
    OK 'Password reset -- data untouched'
}

if (-not $jwt) { $jwt = New-Secret 48 }

# ------------------------------------------------------- write config\.env
Say "Writing $envFile"
$envText = @"
DATABASE_URL="$dbUrl"
JWT_SECRET="$jwt"
NODE_ENV=production

# pg_dump is not on PATH on Windows. Without these two the nightly backup
# fails every night and the only sign is a line in the log.
PG_DUMP_PATH=$pgBin\pg_dump.exe
PG_RESTORE_PATH=$pgBin\pg_restore.exe
"@
Copy-Item $envFile "$envFile.bak" -Force -ErrorAction SilentlyContinue
Set-Content -Path $envFile -Value $envText -Encoding ascii
OK 'config\.env written (old file kept as .env.bak)'

# ------------------------------------------------- service env variables
Say 'Checking the API service environment'
$extra = NssmGet get $API AppEnvironmentExtra
if ($extra -match 'WOS_ENV_FILE') {
    OK 'API service already reads config\.env'
} else {
    Bad 'API service lost its environment -- re-setting'
    Nssm stop $API
    Nssm set $API AppEnvironmentExtra "WOS_ENV_FILE=$envFile" "PORT=3000"
    OK 'WOS_ENV_FILE + PORT restored on the API service'
}
$webExtra = NssmGet get $WEB AppEnvironmentExtra
if ($webExtra -notmatch 'PORT') {
    Nssm stop $WEB
    Nssm set $WEB AppEnvironmentExtra "PORT=3001" "HOSTNAME=0.0.0.0"
    OK 'Panel service environment restored'
}

# ------------------------------------------------------------- start + test
Say 'Starting and testing'
Nssm restart $API
$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 4
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}
if ($healthy) {
    Write-Host ''
    Write-Host ('  API HEALTH: ' + $r.Content) -ForegroundColor Green
    OK 'Server is UP. The seller app and panel will reconnect on their own.'
} else {
    Bad 'API still not answering. Send C:\WarehouseOS\data\api.log for review.'
    exit 1
}

Write-Host ''
Write-Host '=== Fix finished ===' -ForegroundColor Cyan
