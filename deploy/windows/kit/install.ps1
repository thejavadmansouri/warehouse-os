<#
    Kardo (Warehouse OS) -- portable install, no administrator rights.

    ASCII ONLY. Windows PowerShell 5.1 parses .ps1 with the system ANSI codepage,
    so one non-ASCII byte (a Persian comment, an em dash) breaks the parser on
    the machine that matters -- the other laptop. Persian text the operator
    reads lives in README.txt and info-template.txt, which nothing parses.

    Nothing is installed system-wide: no services, no PATH edits, no firewall
    rules, no registry. This folder IS the install -- runtime, app, then data\,
    config\ and backups\ created next to them. It runs as the logged-in user,
    which is also why PostgreSQL is happy: postgres.exe refuses to start under
    an elevated token on Windows.
#>
param(
    # The panel resolves the API at runtime but on a fixed port (see
    # apps/web/src/lib/api.ts), so 3000 is not a suggestion -- changing it here
    # needs a rebuild with NEXT_PUBLIC_API_PORT set.
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001,
    # Not 5432 on purpose: this kit must not collide with a PostgreSQL already
    # installed on the laptop.
    [int]$DbPort = 5433,
    [switch]$NoStart,
    [switch]$NoShortcut
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
$config  = Join-Path $Root 'config'
$envFile = Join-Path $config '.env'
$backups = Join-Path $Root 'backups'
$data    = Join-Path $Root 'data'
$dataDir = Join-Path $data 'pg'

New-Item -ItemType Directory -Force -Path $data, $config, $backups | Out-Null
$installLog = Join-Path $data 'install.log'
Start-Transcript -Path $installLog -Force | Out-Null

trap {
    Bad $_.Exception.Message
    Write-Host "`n  Full log: $installLog" -ForegroundColor Yellow
    Stop-Transcript | Out-Null
    exit 1
}

Write-Host ''
Write-Host '  Kardo -- install into this folder' -ForegroundColor Cyan
Write-Host "  $Root" -ForegroundColor DarkGray

# --------------------------------------------------------------- one time?
if (Test-Path $envFile) {
    Warn 'config\.env already exists -- this copy is already installed.'
    Step 'Nothing was overwritten. Use start.bat to run it.'
    Stop-Transcript | Out-Null
    exit 0
}

# --------------------------------------------------------------- preflight
Say 'Checking the kit is complete'
$required = @(
    $node,
    (Join-Path $appApi 'dist\src\main.js'),
    (Join-Path $appApi 'node_modules\prisma\build\index.js'),
    (Join-Path $appWeb 'server.js'),
    (Join-Path $pgBin 'postgres.exe'),
    (Join-Path $pgBin 'initdb.exe')
)
$missing = @($required | Where-Object { -not (Test-Path $_) })
if ($missing.Count -gt 0) {
    foreach ($m in $missing) { Bad "missing: $m" }
    throw 'The kit is incomplete -- re-copy it (or rebuild it with build-kit.ps1).'
}
Step 'all present'

<#
    PostgreSQL 18 is built against the Visual C++ 2015-2022 runtime. Most laptops
    have it; a clean Windows image may not, and then postgres.exe fails with a
    missing-DLL dialog nobody can act on.
#>
if (-not (Test-Path 'C:\Windows\System32\vcruntime140_1.dll')) {
    $vcRedist = Join-Path $Root 'runtime\vc_redist.x64.exe'
    if (Test-Path $vcRedist) {
        Warn 'Visual C++ runtime is missing -- installing it (a UAC prompt may appear).'
        Start-Process -FilePath $vcRedist -ArgumentList '/install', '/quiet', '/norestart' -Wait
    }
    if (-not (Test-Path 'C:\Windows\System32\vcruntime140_1.dll')) {
        throw 'The Visual C++ runtime is missing. Run runtime\vc_redist.x64.exe yourself, then install.bat again.'
    }
    Step 'Visual C++ runtime installed'
} else {
    Step 'Visual C++ runtime present'
}

# --------------------------------------------------------------- secrets
# One set per install: a shared JWT_SECRET would let anyone holding the kit
# forge an admin token for every shop that used it.
function New-Secret([int]$bytes) {
    $b = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','x').Replace('/','y')
}
$dbPassword = New-Secret 24
$jwtSecret  = New-Secret 48
$adminPass  = New-Secret 9

# --------------------------------------------------------------- database
Say "Creating the database (port $DbPort)"
if (Test-Path $dataDir) {
    throw "data\pg already exists but config\.env does not -- this folder is half-installed. Delete data\pg and run install.bat again."
}

$pwFile = Join-Path $env:TEMP ('kardo-pg-' + [Guid]::NewGuid().ToString('N') + '.txt')
Set-Content -Path $pwFile -Value $dbPassword -NoNewline -Encoding ascii
$initLog = Join-Path $data 'initdb.log'

try {
    <#
        Start-Process and not "& initdb 2>&1": under $ErrorActionPreference='Stop'
        PowerShell 5.1 turns every line a native program writes to stderr into a
        terminating error, and initdb writes ordinary progress to stderr. The
        install then died on a harmless warning before it had created anything.
    #>
    $init = Start-Process -FilePath (Join-Path $pgBin 'initdb.exe') -Wait -PassThru `
        -WindowStyle Hidden `
        -ArgumentList @('-D', $dataDir, '-U', 'postgres', "--pwfile=$pwFile",
                       '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256') `
        -RedirectStandardOutput $initLog -RedirectStandardError ($initLog + '.err')
    $initCode = $init.ExitCode
} finally {
    Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
}

<#
    initdb -- not this script -- decides whether the token is privileged enough,
    so let it speak instead of guessing.

    Guessing went wrong once already: WindowsPrincipal.IsInRole(Administrator)
    answers "yes" for a UAC-filtered token, which is every normal double-click.
    The install then refused to run on exactly the machine it was built for.

    PostgreSQL's own refusal is the only reliable signal, and it is a plain
    sentence in its output.
#>
if ($initCode -ne 0) {
    $initText = ''
    foreach ($f in @($initLog, $initLog + '.err')) {
        if (Test-Path $f) { $initText += (Get-Content $f -Raw) }
    }
    Write-Host $initText
    if ($initText -match 'administrative permissions') {
        throw 'This window runs with administrator rights and PostgreSQL refuses to start elevated. Close it and run install.bat by double-clicking normally (no "Run as administrator").'
    }
    throw 'initdb failed -- the output above says why.'
}
Step 'cluster created'

$conf = Join-Path $dataDir 'postgresql.conf'
# Loopback only. The panel and the phones talk to the API, never to Postgres.
Add-Content $conf "`nlisten_addresses = 'localhost'"
Add-Content $conf "`nport = $DbPort"

Say 'Starting the database'
<#
    Start-Process, never `pg_ctl ... | Out-Null`.

    pg_ctl starts postgres.exe as its own child, and that child inherits the
    pipe. PowerShell then waits for the pipe to close -- which is when the
    database stops, i.e. never. The install sat there for ten minutes with the
    database already answering and nothing else happening.

    Files as handles have no such problem.
#>
# One log per action: postgres inherits cmd's file handle and holds it while it
# runs, so a shared name would make the next action fail to open it.
$pgCtlLog = Join-Path $data 'pgctl-install.log'
<#
    cmd /s /c, with the redirection done by cmd.

    Three traps, all of which this install walked into once:
      1. `pg_ctl ... | Out-Null` never returns -- postgres inherits the pipe and
         PowerShell waits for it to close.
      2. Start-Process -Wait in Windows PowerShell waits for the process *and
         its descendants*, and postgres is pg_ctl's descendant.
      3. Start-Process -ArgumentList @(...) joins with spaces and drops quotes,
         so -o "-p 5433" became three arguments and pg_ctl refused.

    Here cmd owns the file handles, exits with pg_ctl, and PowerShell waits only
    for cmd.
#>
$pgArgs = 'start -D "' + $dataDir + '" -l "' + (Join-Path $data 'db.log') + '" -o "-p ' + $DbPort + '" -w'
$pgCmd  = '"' + (Join-Path $pgBin 'pg_ctl.exe') + '" ' + $pgArgs + ' > "' + $pgCtlLog + '" 2>&1'
& cmd.exe /s /c $pgCmd
$pgCode = $LASTEXITCODE
if ($pgCode -ne 0) {
    foreach ($f in @($pgCtlLog, $pgCtlLog + '.err', (Join-Path $data 'db.log'))) {
        if (Test-Path $f) { Get-Content $f -Tail 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow } }
    }
    throw 'pg_ctl could not start the database.'
}

$ready = $false
foreach ($attempt in 1..30) {
    & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p $DbPort -q
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw "The database did not accept connections. See $data\db.log" }
Step 'database is answering'

$env:PGPASSWORD = $dbPassword
& (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p $DbPort -U postgres warehouse_os
if ($LASTEXITCODE -ne 0) { throw 'createdb failed' }
Step 'database warehouse_os created'

# --------------------------------------------------------------- config
Say 'Writing config\.env'
$dbUrl = "postgresql://postgres:$dbPassword@127.0.0.1:$DbPort/warehouse_os?schema=public&connection_limit=12&pool_timeout=20"

<#
    ASCII, and not -Encoding utf8: PowerShell 5.1's "utf8" means UTF-8 *with*
    BOM, and those three bytes glue themselves to the first key name -- then
    DATABASE_URL is silently missing and the API never starts.
#>
@"
# Kardo settings for this copy. An update never touches this file.
# WARNING: the database password exists only here. Lose it and the data cannot
# be opened.

DATABASE_URL="$dbUrl"
JWT_SECRET="$jwtSecret"
NODE_ENV=production
PORT=$ApiPort
WEB_PORT=$WebPort

# The first admin (username: admin) gets this password. Change it after the
# first login from the panel.
ADMIN_INITIAL_PASSWORD="$adminPass"

# pg_dump is never on PATH on Windows; without these two the nightly backup
# fails and the only trace is one line in a log.
PG_DUMP_PATH=$pgBin\pg_dump.exe
PG_RESTORE_PATH=$pgBin\pg_restore.exe

SMS_PROVIDER=""
AUTO_CONFIRM_ENABLED=false
"@ | Set-Content -Path $envFile -Encoding ascii
Step 'config\.env written'

# --------------------------------------------------------------- schema
Say 'Running database migrations'
$env:DATABASE_URL = $dbUrl
Push-Location $appApi
try {
    & $node (Join-Path $appApi 'node_modules\prisma\build\index.js') migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy failed' }
} finally {
    Pop-Location
}
Step 'schema is up to date'

<#
    Pin the backup folder before the server ever runs: left unset it derives a
    path from its own working directory, and the operator looks for backups
    somewhere they are not. ON CONFLICT keeps a folder the manager later picks
    in the UI.
#>
Say 'Pointing backups at backups\'
$destSql = $backups.Replace("'", "''")
$seedSql = @"
INSERT INTO "BackupConfig" ("id", "destination", "updatedAt")
VALUES ('singleton', '$destSql', NOW())
ON CONFLICT ("id") DO NOTHING;
"@
$seedSql | & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p $DbPort -U postgres -d warehouse_os -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { throw 'could not set the backup folder' }
Step "backups -> $backups"

# --------------------------------------------------------------- shortcut
<#
    One shortcut on the desktop, a plain .url: WScript.Shell .lnk saving throws
    FileNotFoundException on a Persian file name, and the file name here is
    Persian (built from code points, so this script stays ASCII).
#>
if (-not $NoShortcut) {
    try {
        $sb = New-Object System.Text.StringBuilder
        foreach ($p in @(0x06A9, 0x0627, 0x0631, 0x062F, 0x0648)) { [void]$sb.Append([char]$p) }
        $shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) ($sb.ToString() + '.url')
        [IO.File]::WriteAllText($shortcut, "[InternetShortcut]`r`nURL=http://127.0.0.1:$WebPort`r`n", [Text.Encoding]::ASCII)
        Step "desktop shortcut: $shortcut"
    } catch {
        Warn "Could not create the desktop shortcut (not fatal): $($_.Exception.Message)"
    }
}

# --------------------------------------------------------------- info file
Say 'Writing INSTALL-INFO.txt'
$tpl = Join-Path $Root 'info-template.txt'
if (Test-Path $tpl) {
    $info = [IO.File]::ReadAllText($tpl, [Text.Encoding]::UTF8)
    $info = $info.Replace('{{PANEL}}',  "http://127.0.0.1:$WebPort")
    $info = $info.Replace('{{API}}',    "http://127.0.0.1:$ApiPort")
    $info = $info.Replace('{{ADMIN}}',  'admin')
    $info = $info.Replace('{{PASS}}',   $adminPass)
    $info = $info.Replace('{{ROOT}}',   $Root)
    $info = $info.Replace('{{DBPORT}}', "$DbPort")
    $info = $info.Replace('{{DATE}}',   (Get-Date -Format 'yyyy-MM-dd HH:mm'))
    [IO.File]::WriteAllText((Join-Path $Root 'INSTALL-INFO.txt'), $info, (New-Object Text.UTF8Encoding $false))
}

Stop-Transcript | Out-Null

Write-Host ''
Write-Host '=======================================================' -ForegroundColor Green
Write-Host '  Installed' -ForegroundColor Green
Write-Host '=======================================================' -ForegroundColor Green
Write-Host "  Panel:   http://127.0.0.1:$WebPort"
Write-Host "  API:     http://127.0.0.1:$ApiPort"
Write-Host "  Login:   admin / $adminPass" -ForegroundColor White
Write-Host "  Details: $Root\INSTALL-INFO.txt"
Write-Host ''

if ($NoStart) {
    Write-Host '  Start it with start.bat'
    exit 0
}

$startScript = Join-Path $Root 'start.ps1'
if (Test-Path $startScript) {
    & $startScript -ApiPort $ApiPort -WebPort $WebPort -DbPort $DbPort
    if ($LASTEXITCODE -ne 0) {
        Bad 'Installed, but the stack did not come up cleanly -- see data\api.log and data\web.log'
        Read-Host 'Press Enter to close'
        exit 1
    }
} else {
    Write-Host '  Start it with start.bat'
}
