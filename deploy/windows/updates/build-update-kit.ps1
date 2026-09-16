<#
    Build an update kit for the shop server.

    WHY THIS EXISTS
      deploy/windows/updates/apply-update.ps1 (v4, 2026-09-09) has been the
      intended way to update the shop since it was written, and it has never
      been used, because nobody ever assembled the kit it reads. That is why the
      shop still runs Setup-0.4.0 plus a hand-copied seller exe, and why
      run-check.bat on the shop reports "Update kit is complete" as FAILED with
      all five items missing.

      The kit is the delta, not the whole product: web panel + API build +
      prisma folder + seller shell. About 60 MB against the 330 MB Setup.exe,
      no installer, no first-run, database and settings untouched.

    WHAT IT REFUSES TO DO
      Build a kit out of stale files. On 2026-09-07 a seller exe from 20:52 was
      shipped while the desktop sources had already changed at 17:37 the next
      day - a hand-built package cannot tell. This script compares every
      artifact against the newest source file in apps\ and packages\ and stops
      if any artifact is older (-AllowStale overrides, and says so loudly).

    USAGE
      powershell -ExecutionPolicy Bypass -File build-update-kit.ps1
          -> kits\kardo-update-<yyyy-MM-dd>\, refusing to overwrite.
      powershell -ExecutionPolicy Bypass -File build-update-kit.ps1 -Name kardo-update-2026-09-16 -Force
          -> explicit name, overwrite an existing folder.
      powershell -ExecutionPolicy Bypass -File build-update-kit.ps1 -KitSelfTest
          -> validate an existing kit and change nothing.
      powershell -ExecutionPolicy Bypass -File build-update-kit.ps1 -AllowStale
          -> build anyway (records the staleness in kit-contents.txt).

    ASCII ONLY, PowerShell 5.1 syntax only (same rule as build.ps1 and
    update.ps1): no ternary, no ??, no &&. The Persian operator notes live in
    KIT-README-FA.txt next to this script and are copied as a file, never
    embedded here - a non-ASCII literal in a .ps1 without a BOM is mojibake on
    a stock Windows console.
#>
[CmdletBinding()]
param(
    # Kit folder name. Default: kardo-update-<today>.
    [string]$Name = '',
    # Repository root. Default: three levels up from this script.
    [string]$Repo = '',
    # Kit output folder. Default: <this folder>\kits\<Name>.
    [string]$Out = '',
    # Only validate the kit, do not build.
    [switch]$KitSelfTest,
    # Build even when an artifact is older than the sources.
    [switch]$AllowStale,
    # Overwrite an existing kit folder.
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Repo) { $Repo = (Resolve-Path (Join-Path $here '..\..\..')).Path }
if (-not $Name) { $Name = 'kardo-update-' + (Get-Date -Format 'yyyy-MM-dd') }
if (-not $Out) { $Out = Join-Path $here ('kits\' + $Name) }

function Say([string]$m) { Write-Host $m }
function Fail([string]$m) { throw $m }

# ---------------------------------------------------------------- source scan
# Directory names that never contain hand-written source worth comparing a
# build output against. Without this the scan walks node_modules (hundreds of
# thousands of files) and, worse, would treat generated .ts files under
# .next\types as source.
$script:skipDirs = @('node_modules', '.next', 'dist', 'target', 'build', 'coverage', '.turbo', 'out', '.git', 'obj', 'bin')

# Source extensions per artifact. Each build output is only compared against the
# sources that feed it: a web .tsx change cannot make the API build stale, and
# prisma\ is source that is copied as-is, not a build output.
$script:extApi   = @('.ts', '.js', '.json', '.prisma', '.sql')
$script:extWeb   = @('.ts', '.tsx', '.css', '.mjs', '.json', '.mdx')
$script:extShell = @('.rs', '.toml', '.ts', '.tsx', '.json')

function Get-NewestFile {
    param(
        [string]$Root,
        [string[]]$Exts = $null,
        [string[]]$Skip = $script:skipDirs
    )
    if (-not (Test-Path $Root)) { return $null }
    $newest = $null
    $stack = New-Object System.Collections.Stack
    $stack.Push((Resolve-Path $Root).Path)
    while ($stack.Count -gt 0) {
        $dir = $stack.Pop()
        foreach ($s in [System.IO.Directory]::GetDirectories($dir)) {
            $leaf = [System.IO.Path]::GetFileName($s)
            if ($Skip -contains $leaf) { continue }
            $stack.Push($s)
        }
        foreach ($f in [System.IO.Directory]::GetFiles($dir)) {
            if ($Exts) {
                if ($Exts -notcontains [System.IO.Path]::GetExtension($f)) { continue }
            }
            $t = [System.IO.File]::GetLastWriteTime($f)
            if ($null -eq $newest -or $t -gt $newest.Time) {
                $newest = [pscustomobject]@{ Time = $t; Path = $f }
            }
        }
    }
    return $newest
}

# Minute precision on purpose: a source file saved in the same minute a build
# finished must not be reported as "newer than the build".
function TimeKey([datetime]$t) { return $t.ToString('yyyyMMddHHmm') }

function Get-NewestSourceUnder {
    param([string[]]$Roots, [string[]]$Exts)
    $newest = $null
    foreach ($root in $Roots) {
        $hit = Get-NewestFile -Root $root -Exts $Exts
        if ($hit -and ($null -eq $newest -or $hit.Time -gt $newest.Time)) { $newest = $hit }
    }
    return $newest
}

# ---------------------------------------------------------------- kit layout
$srcWeb    = Join-Path $Repo 'apps\web\.next\standalone'
$srcWebId  = Join-Path $Repo 'apps\web\.next\BUILD_ID'
$srcDist   = Join-Path $Repo 'apps\api\dist'
$srcPrisma = Join-Path $Repo 'apps\api\prisma'
$srcExe    = Join-Path $Repo 'apps\desktop\src-tauri\target\release\warehouse-seller.exe'

# Files the kit must contain because apply-update.ps1 reads them by name.
$requiredInKit = @(
    'apply-update.ps1',
    'run-check.bat',
    'run-update.bat',
    'set-label-settings.cjs',
    'label-settings.json',
    # A kit without a way back is the exact situation this folder exists to fix:
    # the 2026-09-07 package replaced a working exe and shipped no rollback.
    'restore-update.ps1',
    'restore-last.bat',
    'web\server.js',
    'api\dist\src\main.js',
    'api\prisma\migrations',
    'api\prisma\schema.prisma',
    'seller-app\warehouse-seller.exe',
    # Without the stamp /health cannot say which build is running, and "the
    # update worked" is back to being a guess.
    'api\dist\build-info.json'
)

function Test-Kit {
    param([string]$KitPath)
    $problems = New-Object System.Collections.ArrayList
    if (-not (Test-Path $KitPath)) {
        [void]$problems.Add("kit folder not found: $KitPath")
        return $problems
    }
    foreach ($rel in $requiredInKit) {
        if (-not (Test-Path (Join-Path $KitPath $rel))) {
            [void]$problems.Add("missing: $rel")
        }
    }
    $exe = Join-Path $KitPath 'seller-app\warehouse-seller.exe'
    if (Test-Path $exe) {
        $mb = (Get-Item $exe).Length / 1MB
        if ($mb -lt 1) { [void]$problems.Add(('seller exe looks empty ({0:N2} MB)' -f $mb)) }
    }
    # The build stamp is the only thing that lets the shop machine prove which
    # build answered /health. A stamp that names a different kit than the folder
    # it sits in means someone copied files between kits.
    $stampFile = Join-Path $KitPath 'api\dist\build-info.json'
    if (-not (Test-Path $stampFile)) {
        [void]$problems.Add('missing: api\dist\build-info.json (nothing would tell which build is running)')
    } else {
        try {
            $stamp = Get-Content $stampFile -Raw | ConvertFrom-Json
            if (-not $stamp.version) { [void]$problems.Add('api\dist\build-info.json has no version') }
            if (-not $stamp.kit) { [void]$problems.Add('api\dist\build-info.json has no kit name') }
            if ($stamp.kit) {
                $folder = Split-Path $KitPath -Leaf
                if ($stamp.kit -ne $folder) {
                    [void]$problems.Add(('stamp says kit "{0}" but the folder is "{1}"' -f $stamp.kit, $folder))
                }
            }
        } catch {
            [void]$problems.Add('api\dist\build-info.json does not parse as JSON')
        }
    }
    # The settings script is JavaScript; let node itself reject a syntax error
    # here rather than at 68% of the update on the shop machine.
    $setJs = Join-Path $KitPath 'set-label-settings.cjs'
    if ((Test-Path $setJs) -and (Get-Command node -ErrorAction SilentlyContinue)) {
        $out = & node --check $setJs 2>&1
        if ($LASTEXITCODE -ne 0) { [void]$problems.Add("set-label-settings.cjs does not parse: $out") }
    }
    return $problems
}

# ---------------------------------------------------------------- self test only
if ($KitSelfTest) {
    Say ''
    Say '======================================================================'
    Say '  KIT SELF TEST'
    Say '======================================================================'
    # Without a name, the default is today's kit - which means checking a kit
    # built yesterday (or just before midnight) fails with "kit folder not found"
    # instead of reporting on the kit that is actually sitting there. Fall back
    # to the newest existing kit and say which one was chosen.
    if (-not (Test-Path $Out)) {
        $kitsDir = Join-Path $here 'kits'
        $latest = Get-ChildItem -Path $kitsDir -Directory -ErrorAction SilentlyContinue |
                  Where-Object { $_.Name -like 'kardo-update-*' } |
                  Sort-Object Name -Descending | Select-Object -First 1
        if ($latest) {
            Say ("  {0} not found - checking the newest kit instead" -f (Split-Path -Leaf $Out))
            $Out = $latest.FullName
        }
    }
    Say ("  Kit : {0}" -f $Out)
    Say ''
    $problems = @(Test-Kit $Out)
    if ($problems.Count -eq 0) {
        $files = @(Get-ChildItem $Out -Recurse -File -ErrorAction SilentlyContinue)
        $size = ($files | Measure-Object Length -Sum).Sum
        Say ("  PASS - {0} files, {1:N1} MB" -f $files.Count, ($size / 1MB))
        Say '  apply-update.ps1 would accept this kit on the shop machine.'
        $s = Get-Content (Join-Path $Out 'api\dist\build-info.json') -Raw | ConvertFrom-Json
        Say ("  Stamp: version {0}  built {1}  kit {2}  packaged {3}" -f $s.version, $s.builtAt, $s.kit, $s.packagedAt)
        Say '  After the update, /health must report this same version and kit.'
        Say ''
        exit 0
    }
    Say ("  FAIL - {0} problem(s):" -f $problems.Count)
    foreach ($p in $problems) { Say ('    - ' + $p) }
    Say ''
    exit 1
}

# ---------------------------------------------------------------- preconditions
Say ''
Say '======================================================================'
Say '  BUILD UPDATE KIT'
Say '======================================================================'
Say ("  Repo : {0}" -f $Repo)
Say ("  Kit  : {0}" -f $Out)
Say ''

if (-not (Test-Path (Join-Path $Repo 'apps\api\package.json'))) {
    Fail ("This does not look like the repository root (no apps\api\package.json): " + $Repo)
}
foreach ($src in @($srcWeb, $srcDist, $srcPrisma, $srcExe)) {
    if (-not (Test-Path $src)) {
        Fail ("Missing build output: $src`nRun deploy\windows\build.ps1 (or npm run build in that workspace) first.")
    }
}

# ---------------------------------------------------------------- staleness guard
# The web panel is shipped from two things built together: BUILD_ID (written by
# next build) and the standalone tree. Take the older one so a stale half is
# still caught.
$webTree = Get-NewestFile -Root $srcWeb
$webTime = $null
if ($webTree) { $webTime = $webTree.Time }
if (Test-Path $srcWebId) {
    $idTime = (Get-Item $srcWebId).LastWriteTime
    if ($null -eq $webTime -or $idTime -lt $webTime) { $webTime = $idTime }
}

$distHit = Get-NewestFile -Root $srcDist

$artifacts = @(
    [pscustomobject]@{ What = 'web panel (standalone)'; Time = $webTime; Exts = $script:extWeb;
                       SrcRoots = @((Join-Path $Repo 'apps\web'), (Join-Path $Repo 'packages')) }
    [pscustomobject]@{ What = 'api dist'; Time = $distHit.Time; Exts = $script:extApi;
                       SrcRoots = @((Join-Path $Repo 'apps\api'), (Join-Path $Repo 'packages')) }
    [pscustomobject]@{ What = 'seller shell (exe)'; Time = (Get-Item $srcExe).LastWriteTime; Exts = $script:extShell;
                       SrcRoots = @((Join-Path $Repo 'apps\desktop'), (Join-Path $Repo 'packages')) }
)

Say '  Freshness (artifact vs the newest source that feeds it):'
$stale = New-Object System.Collections.ArrayList
foreach ($a in $artifacts) {
    $src = Get-NewestSourceUnder -Roots $a.SrcRoots -Exts $a.Exts
    $a | Add-Member -NotePropertyName NewestSource -NotePropertyValue $src
    $verdict = 'ok'
    if ($src -and ((TimeKey $a.Time) -lt (TimeKey $src.Time))) {
        $verdict = 'STALE'
        [void]$stale.Add($a)
    }
    if ($src) {
        Say ("    [{0,5}] {1,-24} {2:yyyy-MM-dd HH:mm}  vs {3:yyyy-MM-dd HH:mm}" -f $verdict, $a.What, $a.Time, $src.Time)
    } else {
        Say ("    [{0,5}] {1,-24} {2:yyyy-MM-dd HH:mm}  vs no sources found" -f $verdict, $a.What, $a.Time)
    }
}

# prisma\ ships as-is, so it cannot be "stale", but a schema change without a
# migration is the one thing that makes migrate deploy quietly insufficient:
# the API then boots against a database missing those columns. Reported, not
# enforced - only a human can tell a comment edit from a new field.
$schemaFile = Join-Path $srcPrisma 'schema.prisma'
$migrationsDir = Join-Path $srcPrisma 'migrations'
$schemaAdvisory = ''
if ((Test-Path $schemaFile) -and (Test-Path $migrationsDir)) {
    $newestMigration = Get-NewestFile -Root $migrationsDir
    if ($newestMigration -and ((TimeKey (Get-Item $schemaFile).LastWriteTime) -gt (TimeKey $newestMigration.Time))) {
        $schemaAdvisory = ('schema.prisma ({0:yyyy-MM-dd HH:mm}) is newer than the newest migration ({1:yyyy-MM-dd HH:mm}): make sure the change has a migration, or migrate deploy will not create it' -f (Get-Item $schemaFile).LastWriteTime, $newestMigration.Time)
        Say ''
        Say '    WARN  ' + $schemaAdvisory
    }
}
Say ''

if ($stale.Count -gt 0) {
    if (-not $AllowStale) {
        $names = ($stale | ForEach-Object { $_.What }) -join ', '
        Fail ("These artifacts are older than their sources: $names`n" +
              "Rebuild them (deploy\windows\build.ps1) and run this script again.`n" +
              "This is exactly how the 2026-09-07 seller exe was shipped stale.`n" +
              "If you know why the older artifact is correct, use -AllowStale.")
    }
    Say '  WARNING: -AllowStale given - the kit contains artifacts older than their sources.'
    Say ''
}

# ---------------------------------------------------------------- assemble
if (Test-Path $Out) {
    if (-not $Force) {
        Fail ("Kit folder already exists: $Out`nPass -Force to overwrite it, or -Name <other> to build elsewhere.")
    }
    Say ("  Removing the existing kit: {0}" -f $Out)
    Remove-Item -Recurse -Force $Out
}

$webOut = Join-Path $Out 'web'
$apiOut = Join-Path $Out 'api'
# Every destination folder must exist first: Copy-Item refuses to copy a
# container (e.g. prisma\seeds) onto a destination that is not already a folder.
New-Item -ItemType Directory -Force -Path $webOut, (Join-Path $apiOut 'dist'), (Join-Path $apiOut 'prisma'), (Join-Path $Out 'seller-app') | Out-Null

Say '  Copying the web panel'
Copy-Item (Join-Path $srcWeb '*') $webOut -Recurse -Force

# The Windows service runs `node <Root>\app\web\server.js`, but Next's
# standalone output nests the real entry point under a mirror of the build
# machine's source path. Write the same launcher build.ps1 writes, so the fixed
# path always exists. (Copied from build.ps1 on purpose - if that logic changes,
# this must change with it.)
if (-not (Test-Path (Join-Path $webOut 'server.js'))) {
    $serverJs = Get-ChildItem -Path $webOut -Filter server.js -Recurse -File |
                Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
                Select-Object -First 1
    if (-not $serverJs) { Fail 'server.js not found in the web output - is output:"standalone" still set in next.config.ts?' }
    $relative = $serverJs.FullName.Substring($webOut.Length).TrimStart('\')
    $target = './' + $relative.Replace('\', '/')
    $launcher = @"
// Generated by build-update-kit.ps1 -- do not edit.
// Next's standalone output nests the real server under a mirror of the build
// machine's source path, which is not known until build time. This launcher
// gives the Windows service one stable path to start.
require('$target');
"@
    Set-Content -Path (Join-Path $webOut 'server.js') -Value $launcher -Encoding ascii
    Say ("    launcher written: require('{0}')" -f $target)
} else {
    Say '    server.js already at the kit web root'
}

Say '  Copying api dist and prisma'
New-Item -ItemType Directory -Force -Path (Join-Path $apiOut 'dist'), (Join-Path $apiOut 'prisma') | Out-Null
Copy-Item (Join-Path $srcDist '*')   (Join-Path $apiOut 'dist')   -Recurse -Force
Copy-Item (Join-Path $srcPrisma '*') (Join-Path $apiOut 'prisma') -Recurse -Force

<#
    Stamp the copy that will actually run.

    apps\api\dist\build-info.json is written by the api build (write-build-info.cjs)
    with the version from VERSION and the moment the build finished. The kit adds
    its own name and packaging time to that same file, because the kit - not the
    build - is what lands on the shop: /health then answers "kardo-update-
    2026-09-15, packaged 20:31" and the person at the machine can compare that
    with kit-contents.txt instead of trusting that the copy finished.
#>
$stampFile = Join-Path $apiOut 'dist\build-info.json'
$stamp = [ordered]@{}
$builtStampOk = $false
if (Test-Path $stampFile) {
    try {
        $existing = Get-Content $stampFile -Raw | ConvertFrom-Json
        foreach ($p in $existing.PSObject.Properties) { $stamp[$p.Name] = $p.Value }
        $builtStampOk = [bool]$stamp['version']
    } catch {
        Say '    [warn] api\dist\build-info.json did not parse - writing a fresh one'
    }
}
if (-not $stamp.Contains('version') -or -not $stamp['version']) {
    # Old dist built before this stamp existed. The version file is still the
    # source of truth, so the kit stays comparable - it just cannot say when the
    # API itself was built.
    $verFile = Join-Path $Repo 'VERSION'
    if (Test-Path $verFile) { $stamp['version'] = (Get-Content $verFile -Raw).Trim() } else { $stamp['version'] = 'unknown' }
}
if (-not $builtStampOk) {
    Say '    [warn] the api dist had no build stamp - rebuild the api so /health can report builtAt'
}
$stamp['kit'] = $Name
$stamp['packagedAt'] = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss'Z'")
# ASCII-safe JSON: the file is read by node, and a BOM in front of { makes
# JSON.parse throw.
Set-Content -Path $stampFile -Value ($stamp | ConvertTo-Json) -Encoding ascii
Say ("    stamp written: version {0}  kit {1}  packaged {2}" -f $stamp['version'], $stamp['kit'], $stamp['packagedAt'])

Say '  Copying the seller shell'
Copy-Item $srcExe (Join-Path $Out 'seller-app\warehouse-seller.exe') -Force

Say '  Copying the update scripts'
foreach ($f in @('apply-update.ps1', 'run-check.bat', 'run-update.bat', 'restore-update.ps1', 'restore-last.bat', 'set-label-settings.cjs', 'label-settings.json')) {
    Copy-Item (Join-Path $here $f) (Join-Path $Out $f) -Force
}
$readmeFa = Join-Path $here 'KIT-README-FA.txt'
if (Test-Path $readmeFa) {
    Copy-Item $readmeFa (Join-Path $Out 'README-FA.txt') -Force
} else {
    Say '    [warn] KIT-README-FA.txt not found - the kit ships without operator notes'
}

# ---------------------------------------------------------------- kit contents log
$files = @(Get-ChildItem $Out -Recurse -File)
$size = ($files | Measure-Object Length -Sum).Sum
$lines = New-Object System.Collections.ArrayList
[void]$lines.Add('Update kit contents - generated by build-update-kit.ps1')
[void]$lines.Add('')
[void]$lines.Add(('kit        : {0}' -f $Name))
[void]$lines.Add(('built      : {0:yyyy-MM-dd HH:mm:ss}' -f (Get-Date)))
[void]$lines.Add(('repo       : {0}' -f $Repo))
[void]$lines.Add(('files      : {0}' -f $files.Count))
[void]$lines.Add(('size       : {0:N1} MB' -f ($size / 1MB)))
[void]$lines.Add('')
[void]$lines.Add('artifacts (artifact time vs newest source that feeds it):')
foreach ($a in $artifacts) {
    $srcText = 'no sources found'
    if ($a.NewestSource) { $srcText = ('{0:yyyy-MM-dd HH:mm}  {1}' -f $a.NewestSource.Time, $a.NewestSource.Path) }
    [void]$lines.Add(('  {0,-24} {1:yyyy-MM-dd HH:mm}  vs  {2}' -f $a.What, $a.Time, $srcText))
}
[void]$lines.Add('')
[void]$lines.Add('build stamp (what /health must report after this update):')
[void]$lines.Add(('  version    : {0}' -f $stamp['version']))
[void]$lines.Add(('  builtAt    : {0}' -f $stamp['builtAt']))
[void]$lines.Add(('  kit        : {0}' -f $stamp['kit']))
[void]$lines.Add(('  packagedAt : {0}' -f $stamp['packagedAt']))
[void]$lines.Add('')
if ($schemaAdvisory) { [void]$lines.Add('schema advisory            : ' + $schemaAdvisory) }
if ($stale.Count -gt 0) {
    [void]$lines.Add('STALENESS                   : OVERRIDDEN with -AllowStale')
    foreach ($a in $stale) { [void]$lines.Add(('  stale: {0}' -f $a.What)) }
} else {
    [void]$lines.Add('staleness                  : none - every artifact is at least as new as the sources')
}
[void]$lines.Add('')
[void]$lines.Add('what apply-update.ps1 reads from this folder:')
foreach ($rel in $requiredInKit) { [void]$lines.Add(('  ' + $rel)) }
Set-Content -Path (Join-Path $Out 'kit-contents.txt') -Value $lines -Encoding UTF8

# ---------------------------------------------------------------- verify + report
$problems = @(Test-Kit $Out)
Say ''
Say '======================================================================'
Say '  KIT READY'
Say '======================================================================'
$files = @(Get-ChildItem $Out -Recurse -File)
$size = ($files | Measure-Object Length -Sum).Sum
Say ("  Folder : {0}" -f $Out)
Say ("  Files  : {0}" -f $files.Count)
Say ("  Size   : {0:N1} MB" -f ($size / 1MB))
Say ("  Stamp  : version {0}  built {1}  kit {2}" -f $stamp['version'], $stamp['builtAt'], $stamp['kit'])
if ($problems.Count -eq 0) {
    Say '  Check  : PASS - same five items apply-update.ps1 verifies on the shop'
} else {
    Say ("  Check  : FAIL - {0} problem(s)" -f $problems.Count)
    foreach ($p in $problems) { Say ('    - ' + $p) }
}
Say ''
Say '  Next steps'
Say '    1. Copy this whole folder to the flash drive, then to the shop server.'
Say '    2. On the shop server run run-check.bat first (read only, changes nothing).'
Say '    3. Only if every check PASSes: right-click run-update.bat -> Run as administrator.'
Say ''
if ($problems.Count -gt 0) { exit 1 }
exit 0
