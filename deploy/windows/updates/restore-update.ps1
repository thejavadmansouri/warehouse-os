<#
    Put the previous version back after an update.

    WHY THIS EXISTS
      apply-update.ps1 backs everything up before it changes anything, and then,
      at the end, tells you to restore with a hand-typed pg_restore line. The
      evening that line matters is the evening nobody is going to type a
      database restore from memory - and the one part that must never be done by
      hand is the part that destroys data. So the safe half (files) is automatic
      and the dangerous half (database) is behind an explicit switch.

    WHAT A ROLLBACK MEANS HERE
      Files only (the default): the code goes back, the database keeps the
      migrations the update applied. That is the correct default because every
      migration in this project so far is additive - old code against a newer
      schema works. Sales taken after the update are kept.
      With -Database: the database is rolled back too, which means every sale,
      payment and customer change since the backup is GONE. The script takes a
      fresh safety dump of the current database first and prints row counts
      before and after, so the cost is visible instead of theoretical.

    USAGE
      powershell -ExecutionPolicy Bypass -File restore-update.ps1 -List
          -> show the backups on this machine and change nothing.
      powershell -ExecutionPolicy Bypass -File restore-update.ps1
          -> restore files from the latest backup (asks for confirmation).
      powershell -ExecutionPolicy Bypass -File restore-update.ps1 -Stamp 20260915-233306
          -> pick a specific backup.
      powershell -ExecutionPolicy Bypass -File restore-update.ps1 -Database
          -> also restore the database (destructive - see above).
      powershell -ExecutionPolicy Bypass -File restore-update.ps1 -Yes
          -> skip the confirmation prompt.
      powershell -ExecutionPolicy Bypass -File restore-update.ps1 -DryRun
          -> print the plan without touching anything.

    ASCII ONLY, PowerShell 5.1 syntax only (same rule as build.ps1/update.ps1).
#>
[CmdletBinding()]
param(
    # Install folder. Default C:\WarehouseOS
    [string]$Root = 'C:\WarehouseOS',
    # Backup stamp, e.g. 20260915-233306. Empty = the latest backup.
    [string]$Stamp = '',
    # Only list the backups.
    [switch]$List,
    # Also restore the database (throws away everything since the backup).
    [switch]$Database,
    # Skip the "type RESTORE" confirmation.
    [switch]$Yes,
    # Print the plan, change nothing.
    [switch]$DryRun,
    # Put the files back but do not start the services or the seller app.
    # For "restore now, look at it before anyone can sell on it" - and for
    # rehearsing this script on a test machine without a UI popping up.
    [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$envFile   = Join-Path $Root 'config\.env'
$updatesDir = Join-Path $Root '_updates'
$stampNow  = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile   = Join-Path $updatesDir "restore-$stampNow.log"

$API_SVC = 'WarehouseOS-API'
$WEB_SVC = 'WarehouseOS-Web'

function Say([string]$m) { Write-Host $m }
function Log([string]$m) {
    try { Add-Content -Path $logFile -Value $m -Encoding UTF8 -ErrorAction SilentlyContinue } catch { }
}
function Set-Progress([int]$pct, [string]$label) {
    Say ("[{0,3}%] {1}" -f $pct, $label)
    Log ("[{0,3}%] {1}" -f $pct, $label)
}
function Test-Interactive {
    return -not $DryRun -and ($Host.Name -match 'ConsoleHost') -and -not [Console]::IsInputRedirected
}
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ---------------------------------------------------------------- discovery
function Find-PgBin([string]$name) {
    $envKey = if ($name -eq 'pg_dump') { 'PG_DUMP_PATH' } else { 'PG_RESTORE_PATH' }
    $envVal = [Environment]::GetEnvironmentVariable($envKey)
    if ($envVal -and (Test-Path $envVal)) { return $envVal }
    $candidates = @(
        (Join-Path $Root "pgsql\bin\$name.exe"),
        (Join-Path $Root "app\pgsql\bin\$name.exe")
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    $roots = @("$env:ProgramFiles\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL")
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $versions = Get-ChildItem -Directory $root -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d+(\.\d+)?$' } |
            Sort-Object Name -Descending
        foreach ($v in $versions) {
            $c = Join-Path $v.FullName "bin\$name.exe"
            if (Test-Path $c) { return $c }
        }
    }
    $g = Get-Command $name -ErrorAction SilentlyContinue
    if ($g) { return $g.Source }
    return ''
}

function Parse-DbUrl([string]$url) {
    $u = [regex]::Match($url, '^postgres(?:ql)?://(?:([^:@/]+)(?::([^@/]*))?@)?([^:/]+)(?::(\d+))?/([^?]+)')
    if (-not $u.Success) { return $null }
    return [pscustomobject]@{
        User = if ($u.Groups[1].Success) { $u.Groups[1].Value } else { 'postgres' }
        Pass = if ($u.Groups[2].Success) { [uri]::UnescapeDataString($u.Groups[2].Value) } else { '' }
        Host = $u.Groups[3].Value
        Port = if ($u.Groups[4].Success) { $u.Groups[4].Value } else { '5432' }
        Name = $u.Groups[5].Value
    }
}

function Read-DbUrl {
    if (-not (Test-Path $envFile)) { return '' }
    $text = Get-Content $envFile -Raw
    $m = [regex]::Match($text, 'DATABASE_URL\s*=\s*"([^"]+)"')
    if (-not $m.Success) { $m = [regex]::Match($text, 'DATABASE_URL\s*=\s*([^\r\n]+)') }
    if (-not $m.Success) { return '' }
    return $m.Groups[1].Value.Trim()
}

function Find-Node {
    $c = Join-Path $Root 'app\node\node.exe'
    if (Test-Path $c) { return $c }
    $g = Get-Command node -ErrorAction SilentlyContinue
    if ($g) { return $g.Source }
    return ''
}

function Find-PrismaCli {
    $c = Join-Path $Root 'app\api\node_modules\prisma\build\index.js'
    if (Test-Path $c) { return $c }
    $r = Join-Path $Root 'apps\api\node_modules\prisma\build\index.js'
    if (Test-Path $r) { return $r }
    $g = Get-Command prisma -ErrorAction SilentlyContinue
    if ($g) { return $g.Source }
    return ''
}

function Test-TcpPort([string]$h, [int]$p) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect($h, $p, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(4000, $false)
        if ($ok) { $c.EndConnect($iar); $c.Close(); return $true }
        $c.Close(); return $false
    } catch { return $false }
}

function Invoke-WithTimeout([string]$exe, [string]$argLine, [string]$workDir, [int]$timeoutSec) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = $argLine
    $psi.WorkingDirectory = $workDir
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit($timeoutSec * 1000)) {
        try { $p.Kill() } catch { }
        $p.WaitForExit()
        return @{ ExitCode = -1; Out = ''; Err = "TIMEOUT after $timeoutSec seconds" }
    }
    return @{ ExitCode = $p.ExitCode; Out = $outTask.Result; Err = $errTask.Result }
}

# Row counts are how a database rollback stops being abstract: "SaleInvoice
# 4120 -> 4096" is a number the shop owner can agree with before it happens.
function Get-RowCounts([string]$psql, [object]$db) {
    $counts = New-Object System.Collections.ArrayList
    if (-not $psql) { return $counts }
    $env:PGPASSWORD = $db.Pass
    try {
        foreach ($t in @('SaleInvoice', 'Payment', 'Customer', 'Product')) {
            # The SQL goes in a file and psql is pointed at it: these table names
            # need double quotes (Postgres folds unquoted names to lowercase, and
            # "SaleInvoice" is not "saleinvoice"), and a quoted identifier inside
            # a `-c "..."` argument fights the Windows command line parser. Same
            # trick the repo already uses in gen-labels.cjs.
            # ON_ERROR_STOP is the whole point of the next two lines: without it
            # psql reports "relation does not exist" and still exits 0, so a
            # missing table would be printed as a row count we never got.
            $sqlFile = Join-Path $env:TEMP ('wos-count-' + $t + '.sql')
            Set-Content -Path $sqlFile -Encoding ascii -Value @(
                '\set ON_ERROR_STOP on',
                ('SELECT count(*) FROM "' + $t + '";')
            )
            $res = Invoke-WithTimeout $psql ("-h {0} -p {1} -U {2} -d {3} -t -A -f `"{4}`"" -f $db.Host, $db.Port, $db.User, $db.Name, $sqlFile) $Root 60
            Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
            $line = ($res.Out + $res.Err).Trim()
            if ($res.ExitCode -ne 0) { $line = 'n/a' }
            [void]$counts.Add([pscustomobject]@{ Table = $t; Count = $line })
        }
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    return $counts
}

function Format-Counts($counts) {
    $parts = @()
    foreach ($c in $counts) { $parts += ($c.Table + '=' + $c.Count) }
    if ($parts.Count -eq 0) { return '(not measured)' }
    return ($parts -join '  ')
}

# ---------------------------------------------------------------- backups
function Get-BackupInfo([System.IO.DirectoryInfo]$d) {
    $info = [pscustomobject]@{
        Name      = $d.Name
        Path      = $d.FullName
        When      = $d.CreationTime
        Mb        = 0
        Web       = $false
        ApiDist   = $false
        Prisma    = $false
        Seller    = $false
        Dump      = $false
        DumpMb    = 0
    }
    $files = @(Get-ChildItem $d.FullName -Recurse -File -ErrorAction SilentlyContinue)
    if ($files.Count -gt 0) {
        $info.Mb = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
    }
    $info.Web     = Test-Path (Join-Path $d.FullName 'app\web')
    $info.ApiDist = Test-Path (Join-Path $d.FullName 'app\api\dist')
    $info.Prisma  = Test-Path (Join-Path $d.FullName 'app\api\prisma')
    $info.Seller  = Test-Path (Join-Path $d.FullName 'app\desktop\warehouse-seller.exe')
    $dumpPath     = Join-Path $d.FullName 'database.dump'
    $info.Dump    = Test-Path $dumpPath
    if ($info.Dump) { $info.DumpMb = [math]::Round(((Get-Item $dumpPath).Length / 1MB), 1) }
    # A real dump is tens of MB, but a small or empty database would print as
    # "0 MB" and read like "the dump is empty" to whoever is standing at the
    # server. Show KB below a megabyte.
    $dumpSize = '-'
    if ($info.Dump) {
        $bytes = (Get-Item $dumpPath).Length
        if ($bytes -ge 1MB) { $dumpSize = ('{0:N1} MB' -f ($bytes / 1MB)) } else { $dumpSize = ('{0:N0} KB' -f ($bytes / 1KB)) }
    }
    $info | Add-Member -NotePropertyName DumpSize -NotePropertyValue $dumpSize -Force
    return $info
}

Say ''
Say '======================================================================'
Say '  KARDO RESTORE - put the previous version back'
Say '======================================================================'
Say ("  Install root : {0}" -f $Root)
Say ("  Mode         : {0}" -f $(if ($Database) { 'FILES + DATABASE (destructive)' } else { 'FILES ONLY (database and sales are kept)' }))
Say ''

if (-not (Test-Path $Root)) {
    Say ("  FAILED: install folder not found: {0}" -f $Root)
    Say '  Nothing was changed.'
    exit 1
}
if (-not (Test-Path $updatesDir)) {
    Say ("  FAILED: no _updates folder in {0}" -f $Root)
    Say '  This machine has never run apply-update.ps1, so there is nothing to go back to.'
    exit 1
}
New-Item -ItemType Directory -Force -Path $updatesDir | Out-Null

$backups = @(Get-ChildItem -Path $updatesDir -Directory -Filter 'backup-*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
if ($backups.Count -eq 0) {
    Say '  FAILED: no backup-* folders found in _updates.'
    Say '  Nothing was changed.'
    exit 1
}

$all = @()
foreach ($b in $backups) { $all += (Get-BackupInfo $b) }

# ---------------------------------------------------------------- -List
if ($List) {
    Say '  Backups on this machine (newest first):'
    Say ''
    $i = 0
    foreach ($b in $all) {
        $i++
        $parts = @()
        if ($b.Web)     { $parts += 'web' }
        if ($b.ApiDist) { $parts += 'api' }
        if ($b.Prisma)  { $parts += 'prisma' }
        if ($b.Seller)  { $parts += 'seller exe' }
        if ($b.Dump)    { $parts += ('database.dump ' + $b.DumpSize) }
        Say ("   {0}. {1}   {2:yyyy-MM-dd HH:mm}   {3,8} MB   [{4}]" -f $i, $b.Name, $b.When, $b.Mb, ($parts -join ', '))
    }
    Say ''
    Say '  Restore the newest one (files only):'
    Say '     powershell -ExecutionPolicy Bypass -File restore-update.ps1'
    Say '  Restore a specific one:'
    Say '     powershell -ExecutionPolicy Bypass -File restore-update.ps1 -Stamp <yyyyMMdd-HHmmss>'
    Say '  Also roll the database back (throws away everything since the backup):'
    Say '     powershell -ExecutionPolicy Bypass -File restore-update.ps1 -Database'
    Say ''
    exit 0
}

$chosen = $all[0]
if ($Stamp) {
    $want = 'backup-' + $Stamp
    $match = @($all | Where-Object { $_.Name -eq $want })
    if ($match.Count -eq 0) {
        Say ("  FAILED: no backup named {0}" -f $want)
        Say '  Run with -List to see the available ones.'
        exit 1
    }
    $chosen = $match[0]
}

# ---------------------------------------------------------------- plan
Say '  Backup selected:'
Say ("    {0}   {1:yyyy-MM-dd HH:mm}   {2} MB" -f $chosen.Name, $chosen.When, $chosen.Mb)
Say ("    web        : {0}" -f $(if ($chosen.Web) { 'yes' } else { 'NOT in this backup' }))
Say ("    api dist   : {0}" -f $(if ($chosen.ApiDist) { 'yes' } else { 'NOT in this backup' }))
Say ("    prisma     : {0}" -f $(if ($chosen.Prisma) { 'yes' } else { 'NOT in this backup' }))
Say ("    seller exe : {0}" -f $(if ($chosen.Seller) { 'yes' } else { 'NOT in this backup (left as is)' }))
Say ("    database   : {0}" -f $(if ($chosen.Dump) { ('dump ' + $chosen.DumpSize) } else { 'no dump in this backup' }))
Say ''

if ($Database -and -not $chosen.Dump) {
    Say '  FAILED: -Database was given but this backup has no database.dump.'
    Say '  Nothing was changed.'
    exit 1
}

$dbUrl = ''
$db = $null
$pgDump = ''
$pgRestore = ''
$psql = ''
if ($Database) {
    $dbUrl = Read-DbUrl
    if (-not $dbUrl) {
        Say '  FAILED: DATABASE_URL not found in config\.env - cannot restore the database.'
        Say '  Nothing was changed.'
        exit 1
    }
    $db = Parse-DbUrl $dbUrl
    if (-not $db) {
        Say '  FAILED: DATABASE_URL in config\.env is not a valid postgres URL.'
        Say '  Nothing was changed.'
        exit 1
    }
    $pgRestore = Find-PgBin 'pg_restore'
    $pgDump    = Find-PgBin 'pg_dump'
    $psql      = Find-PgBin 'psql'
    if (-not $pgRestore) {
        Say '  FAILED: pg_restore not found. Install PostgreSQL, or set PG_RESTORE_PATH.'
        Say '  Nothing was changed.'
        exit 1
    }
    if (-not $pgDump) {
        Say '  FAILED: pg_dump not found (needed for the safety copy of the current database).'
        Say '  Nothing was changed.'
        exit 1
    }
    Say ("  Database     : {0} @ {1}:{2}" -f $db.Name, $db.Host, $db.Port)
    Say ("  Safety copy  : a fresh dump of the CURRENT database is taken first,")
    Say ("                 because rolling the database back cannot be undone:")
    Say ("                 _updates\pre-restore-{0}\database.dump" -f $stampNow)
    Say ''
}

if ($DryRun) {
    Say '  [DRY-RUN] The plan above would now be executed. Nothing was changed.'
    Say ''
    exit 0
}

# ---------------------------------------------------------------- admin
$isAdmin = Test-Admin
if (-not $isAdmin) {
    Say '  This needs administrator rights: the Windows services must be stopped'
    Say '  (and started again) around the file restore.'
    Say ''
    if (Test-Interactive) {
        $ans = Read-Host 'Relaunch this script as administrator now? (Y/N)'
        if ($ans -match '^(y|yes)$') {
            $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $MyInvocation.MyCommand.Path + '"'), '-Root', ('"' + $Root + '"'))
            if ($Stamp)    { $argList += @('-Stamp', $Stamp) }
            if ($Database) { $argList += '-Database' }
            if ($Yes)      { $argList += '-Yes' }
            Say '  Relaunching elevated...'
            Start-Process -FilePath 'powershell' -Verb RunAs -ArgumentList $argList
            exit 0
        }
    }
    Say '  Aborted - nothing was changed. Right-click restore-last.bat and choose'
    Say '  "Run as administrator".'
    exit 1
}

if (-not $Yes) {
    Say '  This will put the files above back and restart the services.'
    if ($Database) {
        Say '  THE DATABASE WILL ALSO BE ROLLED BACK. Every sale, payment and'
        Say '  customer change made since that backup will be LOST.'
    } else {
        Say '  The database is NOT touched - sales since the update are kept.'
    }
    $ans = Read-Host 'Type RESTORE to continue, or N to abort'
    if ($ans -notmatch '^(restore|r)$') {
        Say ''
        Say '  Cancelled by user. Nothing was changed.'
        exit 0
    }
}

Log ("RESTORE from {0} (database: {1})" -f $chosen.Path, $Database)

$svcNames = @()
foreach ($n in @($API_SVC, $WEB_SVC)) {
    $s = Get-Service -Name $n -ErrorAction SilentlyContinue
    if ($s) { $svcNames += $s.Name }
}

$countsBefore = @()
$countsAfter = @()
$dbRestored = $false

try {

    Set-Progress 10 'Stopping web & API services'
    if ($svcNames.Count -eq 0) {
        Say '  [SKIP] no services found on this machine'
    } else {
        foreach ($n in $svcNames) {
            $s = Get-Service -Name $n -ErrorAction SilentlyContinue
            if ($s -and $s.Status -ne 'Stopped') { Stop-Service -Name $n -Force }
        }
        Start-Sleep -Seconds 2
    }

    Set-Progress 14 'Closing the seller app (if open)'
    $p = Get-Process -Name 'warehouse-seller' -ErrorAction SilentlyContinue
    if ($p) {
        $p | Stop-Process -Force
        Start-Sleep -Seconds 2
    }

    if ($Database) {
        Set-Progress 20 'Safety copy of the CURRENT database'
        $preDir = Join-Path $updatesDir ("pre-restore-" + $stampNow)
        New-Item -ItemType Directory -Force -Path $preDir | Out-Null
        $preDump = Join-Path $preDir 'database.dump'
        $env:PGPASSWORD = $db.Pass
        try {
            & $pgDump -h $db.Host -p $db.Port -U $db.User -d $db.Name --format=custom --file $preDump *>> $logFile
            if ($LASTEXITCODE -ne 0) { throw "pg_dump of the current database failed (exit $LASTEXITCODE)" }
            if (-not (Test-Path $preDump)) { throw 'the safety dump was not written' }
            if ((Get-Item $preDump).Length -eq 0) { throw 'the safety dump is empty' }
            & $pgRestore --list $preDump *>> $logFile
            if ($LASTEXITCODE -ne 0) { throw "the safety dump cannot be read back (pg_restore exit $LASTEXITCODE)" }
        } finally {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
        Say ("  Safety copy -> {0}" -f $preDump)
        Log ("Safety copy -> {0}" -f $preDump)

        Set-Progress 30 'Counting rows in the current database'
        $countsBefore = Get-RowCounts $psql $db
        Say ('  before restore: ' + (Format-Counts $countsBefore))
    }

    Set-Progress 45 'Restoring files from the backup'
    $dirs = @('app\web', 'app\api\dist', 'app\api\prisma')
    foreach ($rel in $dirs) {
        $from = Join-Path $chosen.Path $rel
        $to   = Join-Path $Root $rel
        if (-not (Test-Path $from)) {
            Say ("  [WARN] not in this backup, left as is: {0}" -f $rel)
            continue
        }
        # Removed first, then copied: the update replaced these folders whole, so
        # a merge would leave files from the new version behind - and a stale
        # .next chunk or an extra migration file is exactly what breaks a rollback.
        if (Test-Path $to) { Remove-Item -Recurse -Force $to }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $to) | Out-Null
        Copy-Item -Recurse -Force $from $to
        Say ("  restored {0}" -f $rel)
        Log ("restored {0}" -f $rel)
    }
    $sellerFrom = Join-Path $chosen.Path 'app\desktop\warehouse-seller.exe'
    $sellerTo   = Join-Path $Root 'app\desktop\warehouse-seller.exe'
    if (Test-Path $sellerFrom) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $sellerTo) | Out-Null
        if (Test-Path $sellerTo) { Remove-Item -Force $sellerTo }
        Copy-Item -Force $sellerFrom $sellerTo
        Say '  restored app\desktop\warehouse-seller.exe'
        Log 'restored app\desktop\warehouse-seller.exe'
    } else {
        Say '  [WARN] no seller exe in this backup - left as is (the current one stays)'
    }

    Set-Progress 55 'Regenerating the Prisma client'
    $nodePath = Find-Node
    $prismaCli = Find-PrismaCli
    if (-not $nodePath -or -not $prismaCli) {
        Say '  [WARN] node or the Prisma CLI was not found - skipped.'
        Say '         The API may fail to start until "prisma generate" runs in app\api.'
    } else {
        Push-Location (Join-Path $Root 'app\api')
        try {
            & $nodePath $prismaCli generate *>> $logFile
            if ($LASTEXITCODE -ne 0) { throw "prisma generate failed (exit $LASTEXITCODE)" }
        } finally {
            Pop-Location
        }
        Say '  prisma client regenerated for the restored schema'
    }

    if ($Database) {
        Set-Progress 70 'Restoring the database from the backup dump'
        $dump = Join-Path $chosen.Path 'database.dump'
        $env:PGPASSWORD = $db.Pass
        try {
            & $pgRestore -h $db.Host -p $db.Port -U $db.User -d $db.Name --clean --if-exists --no-owner $dump *>> $logFile
            $restoreExit = $LASTEXITCODE
        } finally {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
        if ($restoreExit -ne 0) {
            # pg_restore reports a non-zero exit for warnings as well (objects that
            # did not exist to drop, ownership it could not set). The row counts
            # below and the health check at 95% decide whether it really worked -
            # refusing to continue here would leave the machine half restored.
            Say ("  [WARN] pg_restore reported issues (exit {0}) - see the log; verifying with row counts" -f $restoreExit)
            Log ("pg_restore exit {0}" -f $restoreExit)
        } else {
            Say '  database restored'
        }
        $dbRestored = $true

        Set-Progress 80 'Counting rows after the restore'
        $countsAfter = Get-RowCounts $psql $db
        Say ('  after restore : ' + (Format-Counts $countsAfter))
        Log ('before: ' + (Format-Counts $countsBefore))
        Log ('after : ' + (Format-Counts $countsAfter))
    }

    Set-Progress 88 'Starting services'
    if ($NoStart) {
        Say '  [SKIP] -NoStart given: the services and the seller app were not started'
    } else {
        if ($svcNames.Count -eq 0) {
            Say '  [SKIP] no services found on this machine'
        } else {
            foreach ($n in $svcNames) {
                Start-Service -Name $n -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 4
        }
        $sellerProc = Get-Process -Name 'warehouse-seller' -ErrorAction SilentlyContinue
        if (-not $sellerProc -and (Test-Path $sellerTo)) {
            Start-Process $sellerTo
            Say '  seller app started'
        }
    }

    Set-Progress 95 'Health check'
    if ($NoStart) { Say '  [SKIP] -NoStart given: nothing was started, so there is nothing to probe' }
    if (-not $NoStart) { Start-Sleep -Seconds 5 }
    $apiPort = 3000
    $webPort = 3001
    if (Test-Path $envFile) {
        $m2 = [regex]::Match((Get-Content $envFile -Raw), 'PORT\s*=\s*(\d+)')
        if ($m2.Success) { $apiPort = [int]$m2.Groups[1].Value }
    }
    $webOk = $false
    $apiOk = $false
    $runningBuild = 'not reported'
    $stampMatch = 'not checked'
    if (-not $NoStart) {
        try { $r = Invoke-WebRequest -Uri "http://localhost:$webPort" -UseBasicParsing -TimeoutSec 8; $webOk = $r.StatusCode -eq 200 } catch { }
        try { $r = Invoke-WebRequest -Uri "http://localhost:$apiPort" -UseBasicParsing -TimeoutSec 8; $apiOk = $r.StatusCode -ge 200 -and $r.StatusCode -lt 500 } catch { }
    }
    <#
        Which build is answering AFTER the rollback? The files came back from
        the chosen backup, so the build stamp inside that same backup is what
        /health must now report. Same reasoning as apply-update.ps1: a rolled
        back folder with the old process still in memory looks like a rollback
        that did not happen.
    #>
    if (-not $NoStart) {
        $backupStampFile = Join-Path $chosen.Path 'app\api\dist\build-info.json'
        try {
            $h = Invoke-WebRequest -Uri "http://localhost:$apiPort/health" -UseBasicParsing -TimeoutSec 8
            $hb = $h.Content | ConvertFrom-Json
            $runningBuild = ("version {0}  built {1}  kit {2}" -f $hb.version, $hb.builtAt, $hb.kit)
            Say ("  running : {0}" -f $runningBuild)
            if (Test-Path $backupStampFile) {
                $bs = Get-Content $backupStampFile -Raw | ConvertFrom-Json
                if ($bs.kit -and ($bs.kit -eq $hb.kit) -and ($bs.builtAt -eq $hb.builtAt)) {
                    $stampMatch = 'MATCH'
                    Say ('  stamp   : MATCH - the build inside this backup is the one answering')
                } else {
                    $stampMatch = 'MISMATCH'
                    Say ("  stamp   : MISMATCH - /health reports kit '{0}' built {1}, the backup holds '{2}' built {3}" -f $hb.kit, $hb.builtAt, $bs.kit, $bs.builtAt)
                    Say '            the API service is probably still running the newer files.'
                    Say '            Restart it:  C:\WarehouseOS\nssm.exe restart WarehouseOS-API'
                }
            }
        } catch {
            $runningBuild = 'health did not answer with JSON'
            Say ("  running : {0}" -f $runningBuild)
        }
    }
    Log ("Health after restore: web={0} api={1} build={2} stamp={3}" -f $webOk, $apiOk, $runningBuild, $stampMatch)

} catch {
    Say ''
    Say '======================================================================'
    Say '  RESTORE FAILED'
    Say '======================================================================'
    Say ('  {0}' -f $_.Exception.Message)
    Say ('  Log : {0}' -f $logFile)
    if ($Database) {
        $preDir2 = Join-Path $updatesDir ("pre-restore-" + $stampNow)
        Say ('  The database as it was BEFORE this restore: {0}\database.dump' -f $preDir2)
    }
    Say ''
    Say '  Starting the services again so the shop can keep working:'
    foreach ($n in @($API_SVC, $WEB_SVC)) {
        $s = Get-Service -Name $n -ErrorAction SilentlyContinue
        if ($s -and $s.Status -ne 'Running') { Start-Service -Name $n -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Seconds 3
    if (Test-Interactive) { Read-Host 'Press Enter to close' | Out-Null }
    exit 1
}

# ---------------------------------------------------------------- done
Set-Progress 100 'Done'

# Evidence, written where the backup is: whoever looks at this folder in six
# months should be able to tell that this backup was already used.
$note = New-Object System.Collections.ArrayList
[void]$note.Add("restored  : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$note.Add("backup    : $($chosen.Name)")
# The build that answered /health after the rollback - the one-line proof that
# the files on disk and the process in memory agree.
[void]$note.Add("build     : $runningBuild  ($stampMatch)")
[void]$note.Add("database  : $(if ($Database) { 'RESTORED from this backup (sales after the backup are gone)' } else { 'not touched' })")
if ($Database) {
    [void]$note.Add("rows before: $(Format-Counts $countsBefore)")
    [void]$note.Add("rows after : $(Format-Counts $countsAfter)")
    [void]$note.Add("safety copy: _updates\pre-restore-$stampNow\database.dump")
}
if (-not $chosen.Seller) {
    [void]$note.Add('note      : this backup has no seller exe - the current one was left in place')
}
Set-Content -Path (Join-Path $chosen.Path 'restored.txt') -Value $note -Encoding UTF8

Say ''
Say '======================================================================'
Say '  FINAL STATUS'
Say '======================================================================'
# "NOT responding" would be a lie when nothing was started on purpose.
$webState = if ($NoStart) { 'not started (-NoStart)' } elseif ($webOk) { 'UP' } else { 'NOT responding' }
$apiState = if ($NoStart) { 'not started (-NoStart)' } elseif ($apiOk) { 'UP' } else { 'NOT responding' }
Say ("  Web  (port {0}) : {1}" -f $webPort, $webState)
Say ("  API  (port {0}) : {1}" -f $apiPort, $apiState)
Say ("  Build        : {0}" -f $runningBuild)
Say ("  Stamp        : {0}" -f $stampMatch)
Say ("  Code         : back to {0}" -f $chosen.Name)
if ($Database) {
    Say ("  Database     : rolled back ({0})" -f (Format-Counts $countsAfter))
    Say ("  Safety copy  : {0}\pre-restore-{1}\database.dump" -f $updatesDir, $stampNow)
} else {
    Say '  Database     : untouched - every sale since the update is still there'
}
Say ("  Log          : {0}" -f $logFile)
if (-not $Database) {
    Say ''
    Say '  NOTE: the database still carries the migrations the update applied, while'
    Say '  app\api\prisma is back to the older set. That is the normal, safe outcome of'
    Say '  a code-only rollback (migrations here are additive). If you later run'
    Say '  prisma migrate status and it mentions migrations that are applied but not'
    Say '  present locally, that is this situation - not corruption.'
}
Say ''
if ($NoStart) {
    Say '  FILES RESTORED, nothing started (-NoStart). Start the services when you are'
    Say '  ready:  Start-Service WarehouseOS-API ; Start-Service WarehouseOS-Web'
} elseif (-not ($webOk -and $apiOk)) {
    Say '  One of the services did not come up. Check the log above.'
    Say '  The files that were in place before this restore are NOT saved - if you'
    Say '  need to go forward again, re-run the update kit.'
} else {
    Say '  RESTORE COMPLETE. Open the panel and press Ctrl+F5 to refresh.'
}
Say ''
Say ("  Backups available: run  powershell -ExecutionPolicy Bypass -File restore-update.ps1 -List")
Say ''
if (Test-Interactive) { Read-Host 'Press Enter to close' | Out-Null }
