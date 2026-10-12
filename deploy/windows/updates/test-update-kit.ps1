<#
    Test an update kit the way the shop would receive it.

    WHY THIS EXISTS
      The 2026-10-09 kit shipped without migration
      20261009180000_label_roll_100mm_defaults and without the finished
      roll-label PDF, because nothing compared the kit against the repo.
      These six tests are the gate: a kit that fails any of them must not
      go to the shop. Every test is read-only - nothing here touches the
      database data, the shop, or the kit.

    USAGE
      powershell -ExecutionPolicy Bypass -File test-update-kit.ps1
          -> tests the newest kits\kardo-update-*
      powershell -ExecutionPolicy Bypass -File test-update-kit.ps1 -Kit <path>
          -> tests that kit folder.

    ASCII ONLY, PowerShell 5.1 syntax only (same rule as build-update-kit.ps1).
#>
[CmdletBinding()]
param(
    [string]$Kit = ''
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $here '..\..\..')).Path
if (-not $Kit) {
    $latest = Get-ChildItem -Path (Join-Path $here 'kits') -Directory -ErrorAction SilentlyContinue |
              Where-Object { $_.Name -like 'kardo-update-*' } |
              Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw 'no kit found under kits\ - build one with build-update-kit.ps1 first' }
    $Kit = $latest.FullName
}
if (-not (Test-Path $Kit)) { throw ("kit folder not found: " + $Kit) }

$script:failures = New-Object System.Collections.ArrayList
function Say([string]$m) { Write-Host $m }
# Run node with both streams captured through .NET, never through the
# PowerShell pipeline: under $ErrorActionPreference='Stop' a stderr line
# merged with 2>&1 becomes a terminating NativeCommandError even when the
# command itself succeeds (prisma prints a deprecation warning to stderr
# and exits 0). ProcessStartInfo redirection avoids the pipeline entirely.
function Invoke-Node([string[]]$NodeArgs) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'node'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $quoted = foreach ($a in $NodeArgs) { '"' + ($a -replace '"', '\"') + '"' }
    $psi.Arguments = [string]::Join(' ', $quoted)
    $p = [System.Diagnostics.Process]::Start($psi)
    $o = $p.StandardOutput.ReadToEnd()
    $e = $p.StandardError.ReadToEnd()
    $p.WaitForExit()
    return [pscustomobject]@{ Code = $p.ExitCode; Out = ($o + "`n" + $e) }
}
function Add-Result([string]$name, [bool]$ok, [string]$detail) {
    if ($ok) { Say ("  [PASS] " + $name) }
    else { Say ("  [FAIL] " + $name + " - " + $detail); [void]$script:failures.Add($name + ": " + $detail) }
}
function TimeKey([datetime]$t) { return $t.ToString('yyyyMMddHHmm') }
function Get-NewestFileRec([string]$Root, [string[]]$Exts, [string[]]$Skip) {
    $newest = $null
    $stack = New-Object System.Collections.Stack
    $stack.Push((Resolve-Path $Root).Path)
    while ($stack.Count -gt 0) {
        $dir = $stack.Pop()
        foreach ($s in [System.IO.Directory]::GetDirectories($dir)) {
            if ($Skip -contains [System.IO.Path]::GetFileName($s)) { continue }
            $stack.Push($s)
        }
        foreach ($f in [System.IO.Directory]::GetFiles($dir)) {
            if ($Exts -and ($Exts -notcontains [System.IO.Path]::GetExtension($f))) { continue }
            $t = [System.IO.File]::GetLastWriteTime($f)
            if ($null -eq $newest -or $t -gt $newest.Time) {
                $newest = [pscustomobject]@{ Time = $t; Path = $f }
            }
        }
    }
    return $newest
}

Say ''
Say '======================================================================'
Say '  UPDATE KIT ACCEPTANCE TESTS'
Say '======================================================================'
Say ("  Kit  : " + $Kit)
Say ("  Repo : " + $repoRoot)
Say ''

# ------------------------------------------------- T1: kit structure and stamp
Say 'T1  kit structure and build stamp (what apply-update.ps1 verifies)'
$t1ok = $true
$t1why = ''
$required = @(
    'apply-update.ps1', 'run-check.bat', 'run-update.bat', 'set-label-settings.cjs',
    'label-settings.json', 'restore-update.ps1', 'restore-last.bat',
    'web\server.js', 'api\dist\src\main.js', 'api\prisma\migrations',
    'api\prisma\schema.prisma', 'seller-app\warehouse-seller.exe', 'api\dist\build-info.json'
)
foreach ($rel in $required) {
    if (-not (Test-Path (Join-Path $Kit $rel))) { $t1ok = $false; $t1why += 'missing ' + $rel + '; ' }
}
$exe = Join-Path $Kit 'seller-app\warehouse-seller.exe'
if ((Test-Path $exe) -and ((Get-Item $exe).Length / 1MB) -lt 1) { $t1ok = $false; $t1why += 'seller exe < 1 MB; ' }
$stamp = $null
try { $stamp = Get-Content (Join-Path $Kit 'api\dist\build-info.json') -Raw | ConvertFrom-Json } catch { $t1ok = $false; $t1why += 'build-info.json does not parse; ' }
if ($stamp) {
    if (-not $stamp.version) { $t1ok = $false; $t1why += 'stamp has no version; ' }
    if (-not $stamp.kit) { $t1ok = $false; $t1why += 'stamp has no kit name; ' }
    elseif ($stamp.kit -ne (Split-Path $Kit -Leaf)) { $t1ok = $false; $t1why += ('stamp kit "' + $stamp.kit + '" != folder; ') }
}
$setJs = Join-Path $Kit 'set-label-settings.cjs'
if ((Test-Path $setJs) -and (Get-Command node -ErrorAction SilentlyContinue)) {
    $r1 = Invoke-Node @('--check', $setJs)
    if ($r1.Code -ne 0) { $t1ok = $false; $t1why += 'set-label-settings.cjs does not parse; ' }
}
Add-Result 'T1 structure+stamp' $t1ok $t1why

# ------------------------------------------------- T2: the prisma CLI inside the kit runs
Say 'T2  standalone prisma CLI runs (migrations need it on the shop)'
$cliJs = Join-Path $Kit 'api\node_modules\prisma\build\index.js'
$t2ok = $false
$t2why = ''
if (-not (Test-Path $cliJs)) { $t2why = 'api\node_modules\prisma\build\index.js missing' }
elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) { $t2why = 'node not found on this machine' }
else {
    $r = Invoke-Node @($cliJs, '--version')
    if ($r.Code -eq 0 -and $r.Out -match 'prisma') { $t2ok = $true } else { $t2why = 'prisma --version failed' }
}
Add-Result 'T2 prisma CLI runs' $t2ok $t2why

# ------------------------------------------------- T3: kit migrations == repo migrations
Say 'T3  kit carries every migration (the 2026-10-09 gap must not repeat)'
$repoMig = Join-Path $repoRoot 'apps\api\prisma\migrations'
$kitMig = Join-Path $Kit 'api\prisma\migrations'
$t3ok = $true
$t3why = ''
$repoNames = @(Get-ChildItem $repoMig -Directory | ForEach-Object { $_.Name } | Sort-Object)
$kitNames = @(Get-ChildItem $kitMig -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.Name } | Sort-Object)
foreach ($m in $repoNames) { if ($kitNames -notcontains $m) { $t3ok = $false; $t3why += 'kit missing migration ' + $m + '; ' } }
foreach ($m in $kitNames) { if ($repoNames -notcontains $m) { $t3ok = $false; $t3why += 'kit has extra migration ' + $m + '; ' } }
$repoSchema = Join-Path $repoRoot 'apps\api\prisma\schema.prisma'
$kitSchema = Join-Path $Kit 'api\prisma\schema.prisma'
if ((Get-FileHash $repoSchema -Algorithm SHA256).Hash -ne (Get-FileHash $kitSchema -Algorithm SHA256).Hash) {
    $t3ok = $false; $t3why += 'kit schema.prisma differs from repo; '
}
if ($t3why -eq '') { $t3why = ($repoNames.Count).ToString() + ' migrations, schema identical' }
Add-Result 'T3 migrations complete' $t3ok $t3why

# ------------------------------------------------- T4: kit api dist is not stale
Say 'T4  kit api dist is at least as new as the api sources'
$skipDirs = @('node_modules', '.next', 'dist', 'target', 'build', 'coverage', '.turbo', 'out', '.git', 'obj', 'bin')
$extApi = @('.ts', '.js', '.json', '.prisma', '.sql')
$newestSrc = $null
foreach ($r in @((Join-Path $repoRoot 'apps\api'), (Join-Path $repoRoot 'packages'))) {
    $hit = Get-NewestFileRec -Root $r -Exts $extApi -Skip $skipDirs
    if ($hit -and ($null -eq $newestSrc -or $hit.Time -gt $newestSrc.Time)) { $newestSrc = $hit }
}
$newestDist = Get-NewestFileRec -Root (Join-Path $Kit 'api\dist') -Exts $null -Skip @()
$t4ok = $true
$t4why = ''
if (-not $newestDist) { $t4ok = $false; $t4why = 'kit api\dist is empty' }
elseif ((TimeKey $newestDist.Time) -lt (TimeKey $newestSrc.Time)) {
    $t4ok = $false
    $t4why = ('dist {0:yyyy-MM-dd HH:mm} older than source {1:yyyy-MM-dd HH:mm} ({2})' -f $newestDist.Time, $newestSrc.Time, $newestSrc.Path)
}
$contents = Join-Path $Kit 'kit-contents.txt'
if (-not (Test-Path $contents)) { $t4ok = $false; $t4why += 'kit-contents.txt missing; ' }
elseif (@(Select-String -Path $contents -Pattern 'staleness\s*: none' -SimpleMatch:$false).Count -eq 0) {
    $t4ok = $false; $t4why += 'kit-contents.txt does not say staleness: none; '
}
if ($t4why -eq '') { $t4why = ('dist {0:yyyy-MM-dd HH:mm} vs sources {1:yyyy-MM-dd HH:mm}' -f $newestDist.Time, $newestSrc.Time) }
Add-Result 'T4 dist fresh' $t4ok $t4why

# ------------------------------------------------- shared: dev DATABASE_URL (never printed)
# Process scope only: the URL may carry a password, so it is only ever
# passed as a process argument, never written to the console or a file.
$script:dbUrl = ''
$rootEnv = Join-Path $repoRoot '.env'
if (Test-Path $rootEnv) {
    $line = @(Get-Content $rootEnv | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
    if ($line.Count -gt 0) {
        $script:dbUrl = ($line[0] -replace '^DATABASE_URL=', '').Trim().Trim('"').Trim("'")
    }
}

# ------------------------------------------------- T5: kit schema == migrated DB (read-only)
Say 'T5  kit schema matches the migrated database (offline diff, live introspect)'
$t5ok = $false
$t5why = ''
if (-not (Test-Path $cliJs)) { $t5why = 'no kit prisma CLI' }
elseif (-not $script:dbUrl) { $t5why = 'DATABASE_URL not in .env' }
else {
    $r = Invoke-Node @($cliJs, 'validate', '--schema', $kitSchema)
    if ($r.Code -ne 0) { $t5why = 'prisma validate failed' }
    else {
        $d = Invoke-Node @($cliJs, 'migrate', 'diff', '--from-url', $script:dbUrl, '--to-schema-datamodel', $kitSchema, '--script')
        if ($d.Code -ne 0) { $t5why = 'migrate diff failed' }
        else {
            # SQL never starts with '--' (comment), 'warn ' or the pris.ly
            # pointer line (the prisma deprecation notice on stderr, captured
            # into Out together with the diff).
            $codeLines = @($d.Out -split "`r?`n" | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*--' -and $_ -notmatch '^\s*warn ' -and $_ -notmatch 'pris\.ly' })
            if ($codeLines.Count -eq 0) { $t5ok = $true; $t5why = 'validate ok, schema == database' }
            else { $t5why = ('drift: {0} non-comment line(s), first: {1}' -f $codeLines.Count, $codeLines[0].Trim()) }
        }
    }
}
Add-Result 'T5 no drift' $t5ok $t5why

# ------------------------------------------------- T6: kit CLI authenticates + zero pending (read-only)
Say 'T6  kit CLI passes migrate status against this machine DB (nothing applied)'
$t6ok = $false
$t6why = ''
if (-not (Test-Path $cliJs)) { $t6why = 'no kit prisma CLI' }
elseif (-not $script:dbUrl) { $t6why = 'DATABASE_URL not in .env' }
else {
    $env:DATABASE_URL = $script:dbUrl
    $s = Invoke-Node @($cliJs, 'migrate', 'status', '--schema', $kitSchema)
    $env:DATABASE_URL = $null
    if ($s.Code -ne 0) { $t6why = 'migrate status exited non-zero' }
    elseif ($s.Out -match 'Database schema is up to date') { $t6ok = $true; $t6why = 'auth ok, 0 pending' }
    else { $t6why = 'migrations pending against this DB' }
}
Add-Result 'T6 db preflight' $t6ok $t6why

Say ''
Say '======================================================================'
if ($script:failures.Count -eq 0) {
    Say '  ALL 6 TESTS PASS - this kit may go to the shop.'
    Say '  On the shop: run-check.bat first, then run-update.bat as administrator.'
    Say ''
    exit 0
}
Say ("  {0} TEST(S) FAILED:" -f $script:failures.Count)
foreach ($f in $script:failures) { Say ('    - ' + $f) }
Say '  Do not ship this kit.'
Say ''
exit 1
