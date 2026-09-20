# =============================================================================
#  KARDO UPDATE v4 - check first, then apply
# =============================================================================
#  PHASE 1 (CHECK)   : verifies the target machine can be updated. Read-only.
#                      Nothing is stopped, replaced or written (except a log).
#  PHASE 2 (APPLY)   : backup files + database, stop services, replace web/api/
#                      prisma, prisma generate + migrate, label settings,
#                      replace the seller exe, start services, health check.
#
#  USAGE
#    powershell -ExecutionPolicy Bypass -File apply-update.ps1 -CheckOnly
#        -> run the checks only, print a PASS/FAIL report, change NOTHING.
#    powershell -ExecutionPolicy Bypass -File apply-update.ps1
#        -> run the checks; if every check PASSes, ask for confirmation and
#           apply the update. If any check FAILs, it aborts and tells you why.
#    powershell -ExecutionPolicy Bypass -File apply-update.ps1 -Yes
#        -> same, but skip the interactive confirmation.
#    powershell -ExecutionPolicy Bypass -File apply-update.ps1 -Force
#        -> apply even if some checks FAIL (use only if you know why).
#    powershell -ExecutionPolicy Bypass -File apply-update.ps1 -DryRun
#        -> print the exact steps/percentages without executing anything.
#
#  OPTIONS
#    -Root      install folder. Default C:\WarehouseOS
#    -Kit       update kit folder. Default = the folder this script is in.
# =============================================================================

[CmdletBinding()]
param(
    [string]$Root = "C:\WarehouseOS",
    [string]$Kit  = "",
    [switch]$CheckOnly,
    [switch]$Yes,
    [switch]$Force,
    [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ---------------------------------------------------------------- paths
if (-not $Kit) { $Kit = Split-Path -Parent $MyInvocation.MyCommand.Path }
$envFile    = Join-Path $Root 'config\.env'
$stamp      = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir  = Join-Path $Root "_updates\backup-$stamp"
$logDir     = Join-Path $Root "_updates"
$logFile    = Join-Path $logDir "update-$stamp.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$API_SVC = 'WarehouseOS-API'
$WEB_SVC = 'WarehouseOS-Web'

# ---------------------------------------------------------------- helpers
function Say([string]$m) { Write-Host $m }
function Log([string]$m) { Add-Content -Path $logFile -Value $m -Encoding UTF8 }

# True only when a human is watching a real console (never in DryRun,
# never when stdin/stdout is redirected - e.g. run from a script).
function Test-Interactive {
    return -not $DryRun -and ($Host.Name -match 'ConsoleHost') -and -not [Console]::IsInputRedirected
}

function Set-Progress([int]$pct, [string]$label) {
    Say ("[{0,3}%] {1}" -f $pct, $label)
    Log ("[{0,3}%] {1}" -f $pct, $label)
}

# ---------------------------------------------------------------- discovery
function Find-Node {
    $c = Join-Path $Root 'app\node\node.exe'
    if (Test-Path $c) { return $c }
    $g = Get-Command node -ErrorAction SilentlyContinue
    if ($g) { return $g.Source }
    return ""
}

function Find-PrismaCli {
    $c = Join-Path $Root 'app\api\node_modules\prisma\build\index.js'
    if (Test-Path $c) { return $c }
    # The kit carries its own standalone CLI (api\node_modules). Before the update
    # it is the only one on the machine; after the file replacement it is merged
    # into app\api\node_modules and the first path above answers.
    $k = Join-Path $Kit 'api\node_modules\prisma\build\index.js'
    if (Test-Path $k) { return $k }
    $g = Get-Command prisma -ErrorAction SilentlyContinue
    if ($g) { return $g.Source }
    $r = Join-Path $Root 'apps\api\node_modules\prisma\build\index.js'
    if (Test-Path $r) { return $r }
    return ""
}

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
    return ""
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

function Test-TcpPort([string]$h, [int]$p) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect($h, $p, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(4000, $false)
        if ($ok) { $c.EndConnect($iar); $c.Close(); return $true }
        $c.Close(); return $false
    } catch { return $false }
}

# Run an exe with a timeout; returns @{ExitCode; Out; Err}
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
        return @{ ExitCode = -1; Out = ""; Err = "TIMEOUT after $timeoutSec seconds" }
    }
    return @{ ExitCode = $p.ExitCode; Out = $outTask.Result; Err = $errTask.Result }
}

# ---------------------------------------------------------------- check bookkeeping
$script:checks = New-Object System.Collections.ArrayList
function Add-Check([string]$name, [bool]$ok, [string]$detail, [string]$kind = 'FAIL') {
    [void]$script:checks.Add([pscustomobject]@{
        Name = $name; Ok = $ok; Detail = $detail
        Tag = if ($ok) { 'OK' } elseif ($kind -eq 'WARN') { 'WARN' } else { 'FAIL' }
    })
}
function Get-CheckFails { @($script:checks | Where-Object { $_.Tag -eq 'FAIL' }) }
function Get-CheckCount { @($script:checks).Count }

# =============================================================================
#  PHASE 1 - CHECK (read-only)
# =============================================================================
Say ""
Say "======================================================================"
Say "  KARDO UPDATE - CHECK PHASE"
Say "======================================================================"
Say ("  Install root : {0}" -f $Root)
Say ("  Update kit   : {0}" -f $Kit)
Say ("  Mode         : {0}" -f $(if ($CheckOnly) { 'CHECK ONLY - no changes will be made' } else { 'CHECK then APPLY' }))
Say ""

# --- 1. install root + env file ------------------------------------------
$rootOk = Test-Path $Root
$envOk  = Test-Path $envFile
Add-Check "Install folder ($Root)"        $rootOk $(if ($rootOk) { 'found' } else { 'NOT FOUND' })
Add-Check "Config file (config\.env)"     $envOk  $(if ($envOk)  { 'found' } else { 'NOT FOUND' })

# --- 2. runtime -----------------------------------------------------------
$nodePath = ""
$prismaCli = ""
if ($rootOk) {
    $nodePath = Find-Node
    $prismaCli = Find-PrismaCli
}
Add-Check "Node runtime (node.exe)"    ($nodePath -ne "")   $(if ($nodePath) { $nodePath } else { 'not found' })
Add-Check "Prisma CLI (for migrations)" ($prismaCli -ne "") $(if ($prismaCli) { $prismaCli } else { 'not found' })

# --- 3. kit files ---------------------------------------------------------
$kitFiles = @(
    (Join-Path $Kit 'web\server.js'),
    (Join-Path $Kit 'api\dist\src\main.js'),
    (Join-Path $Kit 'api\prisma\migrations'),
    (Join-Path $Kit 'set-label-settings.cjs'),
    (Join-Path $Kit 'seller-app\warehouse-seller.exe')
)
$missingKit = @()
foreach ($kf in $kitFiles) { if (-not (Test-Path $kf)) { $missingKit += $kf } }
Add-Check "Update kit is complete" ($missingKit.Count -eq 0) $(if ($missingKit.Count -eq 0) {
    'all 5 items present (web, api, prisma, label script, seller exe)'
} else {
    ("missing: {0}" -f ($missingKit -join ' | '))
})

# --- 4. windows services --------------------------------------------------
$svcApi = Get-Service -Name $API_SVC -ErrorAction SilentlyContinue
$svcWeb = Get-Service -Name $WEB_SVC -ErrorAction SilentlyContinue
$svcApiOk = $null -ne $svcApi
$svcWebOk = $null -ne $svcWeb
Add-Check "Windows service: $API_SVC" $svcApiOk $(if ($svcApiOk) { "exists ($($svcApi.Status))" } else { 'NOT FOUND - this install may not use services' }) WARN
Add-Check "Windows service: $WEB_SVC" $svcWebOk $(if ($svcWebOk) { "exists ($($svcWeb.Status))" } else { 'NOT FOUND - this install may not use services' }) WARN

# --- 5. database ----------------------------------------------------------
$dbUrl = ""
$dbOk = $false
if ($envOk) {
    $envText = Get-Content $envFile -Raw
    $m = [regex]::Match($envText, 'DATABASE_URL\s*=\s*"([^"]+)"')
    if (-not $m.Success) { $m = [regex]::Match($envText, 'DATABASE_URL\s*=\s*([^\r\n]+)') }
    if ($m.Success) {
        $dbUrl = $m.Groups[1].Value.Trim()
        $db = Parse-DbUrl $dbUrl
        if ($db) {
            $env:DATABASE_URL = $dbUrl
            $tcpOk = Test-TcpPort $db.Host ([int]$db.Port)
            $dbOk = $tcpOk
            Add-Check "Database reachable ($($db.Host):$($db.Port))" $tcpOk $(if ($tcpOk) { 'port open' } else { 'port NOT reachable - is PostgreSQL running?' })
        } else {
            Add-Check "Database URL parses" $false 'DATABASE_URL in config\.env is not a valid postgres URL' WARN
        }
    } else {
        Add-Check "Database URL in config\.env" $false 'DATABASE_URL key not found' WARN
    }
} else {
    Add-Check "Database reachable" $false 'skipped (no config\.env)' WARN
}

# --- 6. prisma migrate status (auth + pending) -----------------------------
$migDetail = "skipped"
$migOk = $true
if ($dbOk -and $nodePath -and $prismaCli) {
    $apiDir = Join-Path $Root 'app\api'
    if (-not (Test-Path $apiDir)) { $apiDir = $Root }
    $res = Invoke-WithTimeout $nodePath "`"$prismaCli`" migrate status" $apiDir 90
    $all = $res.Out + "`n" + $res.Err
    Log ("migrate status (exit {0}):`n{1}" -f $res.ExitCode, $all)
    if ($res.ExitCode -eq -1) {
        $migOk = $false; $migDetail = "timed out after 90s"
    } elseif ($all -match 'P1001|P1000|P1003|P1010|P1012') {
        $migOk = $false
        $errLine = ($all -split "`n" | Where-Object { $_ -match 'P10\d\d' } | Select-Object -First 1)
        $migDetail = "database rejected the connection: $errLine (check password in config\.env)"
    } elseif ($all -match 'No pending migrations|up to date|in sync') {
        $migDetail = "database schema is up to date (no pending migrations)"
    } else {
        $pend = ([regex]::Matches($all, '(?im)^\s*\d{8,}_')).Count
        $migDetail = "database OK - $pend migration(s) pending (will be applied by the update)"
    }
    Add-Check "Database auth + migrations" $migOk $migDetail
} else {
    Add-Check "Database auth + migrations" $false "skipped - prisma CLI or node not found" WARN
}

# --- 7. pg_dump / pg_restore (needed for the automatic backup) ------------
$pgDump    = if ($rootOk) { Find-PgBin 'pg_dump' } else { "" }
$pgRestore = if ($rootOk) { Find-PgBin 'pg_restore' } else { "" }
$pgOk = ($pgDump -ne "") -and ($pgRestore -ne "")
Add-Check "Backup tools (pg_dump, pg_restore)" $pgOk $(if ($pgOk) { "$pgDump" } else { 'not found - automatic DB backup will be impossible' })

# --- 8. disk space --------------------------------------------------------
$diskOk = $true
$diskDetail = "unknown"
if ($rootOk) {
    $drive = (Get-Item $Root).PSDrive
    $freeMB = [math]::Round($drive.Free / 1MB)
    $diskOk = $freeMB -gt 500
    $diskDetail = "$freeMB MB free on $($drive.Name):"
}
Add-Check "Disk space (>= 500 MB free)" $diskOk $diskDetail

# --- 9. ports currently in use (info only) --------------------------------
$apiPort = 3000; $webPort = 3001
if ($envOk) {
    $m2 = [regex]::Match((Get-Content $envFile -Raw), 'PORT\s*=\s*(\d+)')
    if ($m2.Success) { $apiPort = [int]$m2.Groups[1].Value }
}
$apiBusy = Test-TcpPort '127.0.0.1' $apiPort
$webBusy = Test-TcpPort '127.0.0.1' $webPort
Say ("  Info: API port {0} {1} | web port {2} {3}" -f $apiPort, $(if ($apiBusy) { 'in use (running)' } else { 'free' }), $webPort, $(if ($webBusy) { 'in use (running)' } else { 'free' }))

# --- report ----------------------------------------------------------------
Say ""
Say "======================================================================"
Say "  CHECK REPORT"
Say "======================================================================"
$i = 0
foreach ($c in $script:checks) {
    $i++
    $mark = switch ($c.Tag) { 'OK' { ' OK  ' } 'WARN' { 'WARN ' } default { 'FAIL ' } }
    Say ("  [{0}] {1} {2}" -f $mark, $c.Name, $c.Detail)
}
$fails = @(Get-CheckFails)
Say ""
if ($fails.Count -eq 0) {
    Say "  RESULT: ALL CHECKS PASSED - the update can be applied safely."
    if ($CheckOnly) { Say "  (CHECK ONLY mode - nothing was changed. Run without -CheckOnly to apply.)" }
} else {
    Say ("  RESULT: {0} FAILED check(s)." -f $fails.Count)
    Say "  Fix the problems above first. Common fixes:"
    Say "    - 'not found' kit files : the flash copy is incomplete - copy the whole kit folder (see README-FA.txt)"
    Say "    - database rejected     : wrong password in config\.env, or PostgreSQL is not running"
    Say "    - port not reachable    : start the database service (WarehouseOS-DB) first"
    Say "    - no backup tools       : pg_dump/pg_restore missing - install PostgreSQL or set PG_DUMP_PATH"
    Say ""
    Say "  You can force the update anyway with  -Force  (NOT recommended)."
}
Log ("CHECK REPORT: {0}/{1} passed" -f ($script:checks.Count - $fails.Count), (Get-CheckCount))

if ($CheckOnly) {
    Say ""
    Say "  CHECK ONLY - no changes were made."
    if ($fails.Count -eq 0) { exit 0 } else { exit 1 }
}

# =============================================================================
#  PHASE 2 - APPLY
# =============================================================================
if ($fails.Count -gt 0 -and -not $Force -and -not $DryRun) {
    Say ""
    Say "  ABORTED - $($fails.Count) check(s) failed. Nothing was changed."
    Say "  Re-run after fixing the problems, or use -Force to proceed anyway."
    Say ""
    Say "  Log: $logFile"
    if (Test-Interactive) { Read-Host "Press Enter to close" | Out-Null }
    exit 1
}
if ($Force -and $fails.Count -gt 0 -and -not $DryRun) {
    Say "  WARNING: -Force given - proceeding despite $($fails.Count) failed check(s)."
}

Say ""
Say "======================================================================"
Say "  UPDATE SUMMARY"
Say "======================================================================"
Say "  stamp     : /health now reports version + build time + kit name"
Say "  web       : POS cart tabs that survive a refresh; invoice print from ledger"
Say "  api       : payment recomposition + invoice line lock + Tehran-day shifts"
Say "  seller app: warehouse-seller.exe from the current build"
Say "  fix       : one invoice may now mix items from more than one warehouse"
Say "  database  : pending migrations applied; panel label settings not overwritten"
Say "  backup    : current files + full database  ->  $backupDir"
Say "  log       : $logFile"
Say ""
Say "  What happens: backup -> stop services -> replace files -> prisma"
Say "                generate + migrate -> label settings -> seller exe"
Say "                -> start services -> health check."
Say ""

if (-not $Yes -and -not $DryRun) {
    $ans = Read-Host "Type YES to start the update, or N to abort"
    if ($ans -notmatch '^(y|yes)$') {
        Say ""
        Say "  Cancelled by user. Nothing was changed."
        exit 0
    }
} elseif ($DryRun) {
    Say "  [DRY-RUN] Confirmation step skipped."
}

# ---------------------------------------------------------------- backup files
$script:step = 0
function Step([string]$name, [int]$to, [scriptblock]$body) {
    if ($DryRun) { Say ("[{0,3}%] {1}  [DRY-RUN]" -f $to, $name); return }
    Set-Progress $to $name
    & $body
}

try {

Step "Backing up current files" 10 {
    foreach ($rel in @('app\web', 'app\api\dist', 'app\api\prisma')) {
        $src = Join-Path $Root $rel
        if (Test-Path $src) {
            $dst = Join-Path $backupDir $rel
            New-Item -ItemType Directory -Force -Path $dst | Out-Null
            Copy-Item -Recurse -Force "$src\*" $dst
        }
    }
    # The seller shell is one of the things an update replaces, so a rollback that
    # cannot put it back is not a rollback. Single file, not a folder - this is the
    # file restore-update.ps1 reads when it puts the previous version back.
    $sellerOld = Join-Path $Root 'app\desktop\warehouse-seller.exe'
    if (Test-Path $sellerOld) {
        $sellerBak = Join-Path $backupDir 'app\desktop'
        New-Item -ItemType Directory -Force -Path $sellerBak | Out-Null
        Copy-Item -Force $sellerOld (Join-Path $sellerBak 'warehouse-seller.exe')
    }
    Log "File backup -> $backupDir"
}

# ---------------------------------------------------------------- backup db
Step "Backing up database (pg_dump)" 20 {
    if (-not $dbUrl) { throw "No DATABASE_URL - cannot back up the database" }
    $db = Parse-DbUrl $dbUrl
    $dumpFile = Join-Path $backupDir 'database.dump'
    $env:PGPASSWORD = $db.Pass
    try {
        & $pgDump -h $db.Host -p $db.Port -U $db.User -d $db.Name --format=custom --file $dumpFile *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }
        if ((Get-Item $dumpFile).Length -eq 0) { throw "Backup file is empty" }
        & $pgRestore --list $dumpFile *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "Backup cannot be read back (pg_restore exit $LASTEXITCODE)" }
        Log "Database backup -> $dumpFile"
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------- stop services
$svcNames = @()
foreach ($n in @($API_SVC, $WEB_SVC)) {
    $s = Get-Service -Name $n -ErrorAction SilentlyContinue
    if ($s) { $svcNames += $s.Name }
}
Step "Stopping web & API services" 30 {
    if ($svcNames.Count -eq 0) {
        Say "  [SKIP] no services found"
    } else {
        foreach ($n in $svcNames) {
            $s = Get-Service -Name $n -ErrorAction SilentlyContinue
            if ($s -and $s.Status -ne 'Stopped') { Stop-Service -Name $n -Force }
        }
        Start-Sleep -Seconds 2
    }
}

Step "Closing seller app (if open)" 34 {
    $p = Get-Process -Name 'warehouse-seller' -ErrorAction SilentlyContinue
    if ($p) {
        $p | Stop-Process -Force
        Start-Sleep -Seconds 2
        Log "Seller app closed for exe replacement"
    }
}

# ---------------------------------------------------------------- replace
Step "Replacing web, API dist and prisma" 45 {
    # kit layout:    web\ | api\dist\ | api\prisma\
    # install layout: app\web | app\api\dist | app\api\prisma
    $map = @(
        @{ Src = Join-Path $Kit 'web';        Dst = Join-Path $Root 'app\web' },
        @{ Src = Join-Path $Kit 'api\dist';   Dst = Join-Path $Root 'app\api\dist' },
        @{ Src = Join-Path $Kit 'api\prisma'; Dst = Join-Path $Root 'app\api\prisma' }
    )
    foreach ($m in $map) {
        $src = $m.Src
        $dst = $m.Dst
        if (-not (Test-Path $src)) { throw "Kit folder missing: $src" }
        if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
        Copy-Item -Recurse -Force $src $dst
    }
    # The kit's api\node_modules carries ONLY what the shop lacks - the standalone
    # prisma CLI closure that migrations need. It is merged, not replaced: deleting
    # app\api\node_modules outright would also delete the installed @prisma/client
    # and every other module the running API imports.
    $srcMods = Join-Path $Kit 'api\node_modules'
    if (Test-Path $srcMods) {
        $dstMods = Join-Path $Root 'app\api\node_modules'
        New-Item -ItemType Directory -Force -Path $dstMods | Out-Null
        Copy-Item (Join-Path $srcMods '*') $dstMods -Recurse -Force
        Log "Prisma CLI modules merged into app\api\node_modules"
    }
    Log "Files replaced from kit"
}

Step "Regenerating Prisma client (installed)" 52 {
    Push-Location (Join-Path $Root 'app\api')
    # The prisma CLI writes its deprecation chatter to stderr; under EAP=Stop a
    # redirected stderr line becomes a NativeCommandError and kills the step even
    # when the command itself succeeds. The exit code is the judge here, not stderr.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $nodePath $prismaCli generate *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "prisma generate failed (exit $LASTEXITCODE)" }
    } finally {
        $ErrorActionPreference = $prevEap
        Pop-Location
    }
}

Step "Applying pending migrations" 62 {
    Push-Location (Join-Path $Root 'app\api')
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $nodePath $prismaCli migrate deploy *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed (exit $LASTEXITCODE)" }
    } finally {
        $ErrorActionPreference = $prevEap
        Pop-Location
    }
}

Step "Label settings (seed only - panel values kept)" 68 {
    Push-Location (Join-Path $Root 'app\api')
    try {
        & $nodePath (Join-Path $Kit 'set-label-settings.cjs') *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "label settings failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

Step "Replacing seller app (warehouse-seller.exe)" 76 {
    $sellerSrc = Join-Path $Kit 'seller-app\warehouse-seller.exe'
    $sellerDst = Join-Path $Root 'app\desktop\warehouse-seller.exe'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $sellerDst) | Out-Null
    if (Test-Path $sellerDst) { Remove-Item -Force $sellerDst }
    Copy-Item -Force $sellerSrc $sellerDst
    Log "Seller exe replaced"
}

# ---------------------------------------------------------------- start
Step "Starting services" 86 {
    if ($svcNames.Count -eq 0) {
        Say "  [SKIP] no services found"
    } else {
        foreach ($n in $svcNames) {
            Start-Service -Name $n -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 4
    }
    # Always make sure the seller app is up after an update
    $sellerExe = Join-Path $Root 'app\desktop\warehouse-seller.exe'
    $sellerProc = Get-Process -Name 'warehouse-seller' -ErrorAction SilentlyContinue
    if (-not $sellerProc -and (Test-Path $sellerExe)) {
        Start-Process $sellerExe
        Log "Seller app started"
        Say "  Seller app started"
    }
}

# ---------------------------------------------------------------- health
$webOk = $false; $apiOk = $false
$runningBuild = 'not reported'
$stampMatch = 'not checked'
Step "Health check" 95 {
    Start-Sleep -Seconds 5
    try { $r = Invoke-WebRequest -Uri "http://localhost:$webPort" -UseBasicParsing -TimeoutSec 8; $webOk = $r.StatusCode -eq 200 } catch { }
    try { $r = Invoke-WebRequest -Uri "http://localhost:$apiPort" -UseBasicParsing -TimeoutSec 8; $apiOk = $r.StatusCode -ge 200 -and $r.StatusCode -lt 500 } catch { }

    <#
        A 200 on the API says the process is alive, not that THIS build is the
        one running. /health carries the build stamp (version, builtAt, kit)
        written into api\dist by the api build and re-stamped by the kit, so
        the answer can be compared with the kit that was just applied. A
        mismatch means the files were replaced but the API service kept the old
        process in memory - the one failure mode that looks like success.
    #>
    $kitStampFile = Join-Path $Kit 'api\dist\build-info.json'
    try {
        $h = Invoke-WebRequest -Uri "http://localhost:$apiPort/health" -UseBasicParsing -TimeoutSec 8
        $hb = $h.Content | ConvertFrom-Json
        $runningBuild = ("version {0}  built {1}  kit {2}" -f $hb.version, $hb.builtAt, $hb.kit)
        Say ("    running : {0}" -f $runningBuild)
        if (Test-Path $kitStampFile) {
            $ks = Get-Content $kitStampFile -Raw | ConvertFrom-Json
            if ($ks.kit -and ($ks.kit -eq $hb.kit)) {
                $stampMatch = 'MATCH'
                Say ("    stamp   : MATCH - the kit that was just applied ({0}) is the build answering" -f $ks.kit)
            } else {
                $stampMatch = 'MISMATCH'
                Say ("    stamp   : MISMATCH - /health reports kit '{0}', this kit is '{1}'" -f $hb.kit, $ks.kit)
                Say "              the API service is probably still running the old files."
                Say "              Restart it:  C:\WarehouseOS\nssm.exe restart WarehouseOS-API"
            }
        }
    } catch {
        $runningBuild = 'health did not answer with JSON'
        Say ("    running : {0}" -f $runningBuild)
    }
    Log "Health: web=$webOk api=$apiOk build=$runningBuild stamp=$stampMatch"
}

} catch {
    Say ""
    Say "======================================================================"
    Say "  UPDATE FAILED"
    Say "======================================================================"
    Say ("  {0}" -f $_.Exception.Message)
    Say "  Log    : $logFile"
    Say "  Backup : $backupDir  (files + database.dump - nothing is lost)"
    Say ""
    Say "  Restarting the services now so the shop stays online (old files are"
    Say "  still in place for the parts that were not replaced yet):"
    foreach ($n in @($API_SVC, $WEB_SVC)) {
        $s = Get-Service -Name $n -ErrorAction SilentlyContinue
        if ($s -and $s.Status -ne 'Running') { Start-Service -Name $n -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Seconds 3
    Say "  Done. Then fix the problem and run the script again - it is safe to"
    Say "  re-run (it backs up, replaces and migrates cleanly)."
    if (Test-Interactive) { Read-Host "Press Enter to close" | Out-Null }
    exit 1
}

# ---------------------------------------------------------------- done
Set-Progress 100 "Done"
Say ""
Say "======================================================================"
Say "  FINAL STATUS"
Say "======================================================================"
Say ("  Web  (port {0}) : {1}" -f $webPort, $(if ($DryRun) { 'N/A (dry run)' } elseif ($webOk) { 'UP' } else { 'NOT responding' }))
Say ("  API  (port {0}) : {1}" -f $apiPort, $(if ($DryRun) { 'N/A (dry run)' } elseif ($apiOk) { 'UP' } else { 'NOT responding' }))
# The line to quote when telling anyone that the update landed.
Say ("  Build : {0}" -f $(if ($DryRun) { 'N/A (dry run)' } else { $runningBuild }))
Say ("  Stamp : {0}" -f $(if ($DryRun) { 'N/A (dry run)' } else { $stampMatch }))
Say "  Backup  : $backupDir"
Say "  Log     : $logFile"
if (-not $DryRun -and -not ($webOk -and $apiOk)) {
    Say ""
    Say "  One of the services did not come up. Check the log file above."
    Say "  To restore from the backup if needed:"
    Say ("    pg_restore -U postgres -d warehouse_os --clean --if-exists `"$backupDir\database.dump`"")
    Say "  Then restart the services:"
    Say "    C:\WarehouseOS\nssm.exe start WarehouseOS-API"
    Say "    C:\WarehouseOS\nssm.exe start WarehouseOS-Web"
} else {
    Say ""
    Say "  UPDATE COMPLETE. Open the panel and press Ctrl+F5 to refresh."
}
Say ""
if (Test-Interactive) { Read-Host "Press Enter to close" | Out-Null }