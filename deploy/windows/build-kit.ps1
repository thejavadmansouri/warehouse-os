<#
    Build the portable Kardo kit: one folder (plus a zip) that installs and runs
    the whole stack on another Windows laptop with no prerequisites and no
    administrator rights.

    ASCII ONLY -- see the note at the top of README.md in this folder.

    What goes in:
      runtime\node      node.exe, the same major the app was built with
      runtime\pgsql     PostgreSQL binaries (bin, lib, share) -- initdb runs here
      runtime\           vc_redist.x64.exe, only if the payload has it
      app\api           nest dist + prisma + production node_modules
      app\web           next standalone output + a fixed-path launcher
      app\desktop       the seller shell, when a build of it is on hand
      install/start/stop .ps1 + .bat and a Persian README

    Usage:
      powershell -ExecutionPolicy Bypass -File deploy\windows\build-kit.ps1
      powershell -ExecutionPolicy Bypass -File deploy\windows\build-kit.ps1 -SkipBuild -NoZip

    -SkipBuild reuses whatever is already in apps\api\dist and .next\standalone
    (fast, but it does NOT prove the current source builds).
#>
param(
    [string]$OutDir = [Environment]::GetFolderPath('Desktop'),
    # Where the PostgreSQL binaries come from. Default: the unpacked payload the
    # Inno Setup pipeline already uses.
    [string]$PgRoot = '',
    [switch]$SkipBuild,
    [switch]$NoZip
)

$ErrorActionPreference = 'Stop'
function Say($m)  { Write-Host "`n==== $m" -ForegroundColor Cyan }
function Step($m) { Write-Host "  $m" }
function Ok($m)   { Write-Host "  OK  $m" -ForegroundColor Green }
function Bad($m)  { Write-Host " XX $m" -ForegroundColor Red }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..')).Path
$version = (Get-Content (Join-Path $repo 'VERSION') -Raw).Trim()
if (-not $version) { throw 'The root VERSION file is empty -- bump it there first.' }
if (-not (Test-Path $OutDir)) { throw "Output folder does not exist: $OutDir" }

$stage = Join-Path $OutDir ("kardo-kit-v" + $version)
$zip   = Join-Path $OutDir ("kardo-kit-v" + $version + '.zip')

Say "Kardo kit v$version"
Step "repo:  $repo"
Step "stage: $stage"

if (Test-Path $stage) {
    Step 'removing the previous stage folder'
    Remove-Item $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# ------------------------------------------------------------------- build
if (-not $SkipBuild) {
    Say 'Generating the Prisma client'
    Push-Location $repo
    try {
        cmd.exe /c 'npx prisma generate 2>&1'
        if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed' }
    } finally { Pop-Location }

    Say 'Building the API'
    Push-Location $repo
    try {
        npm run build:api
        if ($LASTEXITCODE -ne 0) { throw 'npm run build:api failed' }
    } finally { Pop-Location }

    Say 'Building the panel'
    Push-Location $repo
    try {
        npm run build:web
        if ($LASTEXITCODE -ne 0) { throw 'npm run build:web failed' }
    } finally { Pop-Location }
} else {
    Step 'skipping the build (--SkipBuild) -- artifacts are whatever was there'
}

# ------------------------------------------------------------------- node
Say 'Node runtime'
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { throw 'node.exe is not on PATH -- install Node 24 on this build machine.' }
$nodeVersion = (& $nodeExe -v)
if ($nodeVersion -notmatch '^v24\.') {
    Bad "Found Node $nodeVersion, the app is built and tested on Node 24."
    throw 'Install Node 24 on this build machine and rebuild.'
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'runtime\node') | Out-Null
Copy-Item $nodeExe (Join-Path $stage 'runtime\node\node.exe')
Ok "node $nodeVersion"

# --------------------------------------------------------------- postgresql
Say 'PostgreSQL runtime'
if (-not $PgRoot) {
    $candidate = Join-Path $here 'payload\pgsql'
    if (Test-Path (Join-Path $candidate 'bin\initdb.exe')) { $PgRoot = $candidate }
}
if (-not $PgRoot -or -not (Test-Path (Join-Path $PgRoot 'bin\initdb.exe'))) {
    throw 'No PostgreSQL binaries found. Pass -PgRoot pointing at an unpacked PostgreSQL 18 zip (the folder holding bin\initdb.exe).'
}
$pgVer = (& (Join-Path $PgRoot 'bin\postgres.exe') --version) -replace '^postgres \(PostgreSQL\)\s*', ''
if ($pgVer -notmatch '^1[78]') { throw "PostgreSQL $pgVer found; the kit expects 18." }

$pgOut = Join-Path $stage 'runtime\pgsql'
New-Item -ItemType Directory -Force -Path $pgOut | Out-Null
# bin/lib/share are the whole binary distribution; pgAdmin, StackBuilder and
# the docs are installer extras that would double the kit for nothing.
foreach ($dir in @('bin', 'lib', 'share')) {
    $from = Join-Path $PgRoot $dir
    if (-not (Test-Path $from)) { throw "Missing $from in the PostgreSQL folder" }
    Copy-Item $from (Join-Path $pgOut $dir) -Recurse -Force
}
Copy-Item (Join-Path $PgRoot 'server_license.txt') $pgOut -ErrorAction SilentlyContinue
Ok "postgres $pgVer (bin, lib, share)"

$vc = Join-Path $here 'payload\vc_redist.x64.exe'
if (Test-Path $vc) {
    Copy-Item $vc (Join-Path $stage 'runtime\vc_redist.x64.exe')
    Ok 'vc_redist.x64.exe (installed only if the target laptop lacks the runtime)'
} else {
    Step 'no vc_redist.x64.exe on hand -- a laptop without the VC++ runtime will need it'
}

# -------------------------------------------------------------------- api
Say 'API'
$apiSrc = Join-Path $repo 'apps\api'
$apiOut = Join-Path $stage 'app\api'
New-Item -ItemType Directory -Force -Path $apiOut | Out-Null

if (-not (Test-Path (Join-Path $apiSrc 'dist\src\main.js'))) {
    Bad 'apps\api\dist\src\main.js is missing -- the API was not built. Drop -SkipBuild.'
    throw 'API build output missing'
}
Copy-Item (Join-Path $apiSrc 'dist')         $apiOut -Recurse
Copy-Item (Join-Path $apiSrc 'prisma')       $apiOut -Recurse
Copy-Item (Join-Path $apiSrc 'package.json') $apiOut
Ok 'dist + prisma + package.json'

# The Prisma CLI version comes from what this repo actually installed, not from
# a range -- the migrations were written and tested against that one.
$prismaPkg = Join-Path $repo 'node_modules\prisma\package.json'
if (-not (Test-Path $prismaPkg)) { throw 'The Prisma CLI is not in the repo node_modules -- run npm ci here first.' }
$prismaVersion = (Get-Content $prismaPkg -Raw | ConvertFrom-Json).version

Push-Location $apiOut
try {
    Step "installing production dependencies (prisma $prismaVersion) -- this takes a minute"
    npm install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'installing the API runtime dependencies failed' }

    # prisma is a root devDependency and is not in apps\api\package.json at all,
    # so the install above never brings it. Without it `migrate deploy` cannot
    # run on the target laptop and the install dies halfway through.
    npm install --omit=dev --no-audit --no-fund --save-exact "prisma@$prismaVersion"
    if ($LASTEXITCODE -ne 0) { throw 'installing the Prisma CLI failed' }

    npx prisma generate
    if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed in the staged API' }
} finally { Pop-Location }

$prismaEntry = Join-Path $apiOut 'node_modules\prisma\build\index.js'
if (-not (Test-Path $prismaEntry)) { throw "Prisma CLI entry point missing: $prismaEntry" }
Ok 'production node_modules + prisma CLI'

# -------------------------------------------------------------------- web
Say 'Panel'
$standalone = Join-Path $repo 'apps\web\.next\standalone'
if (-not (Test-Path $standalone)) {
    throw 'standalone output not found -- build the panel (output:"standalone" in next.config.ts).'
}
$standalone = (Resolve-Path $standalone).Path

$webOut = Join-Path $stage 'app\web'
New-Item -ItemType Directory -Force -Path $webOut | Out-Null

# The whole tree: Next mirrors the build machine's path inside it and hoists
# node_modules to more than one level of that mirror -- `next` itself lives in
# the inner one, so copying only the folder holding server.js ships a panel
# that starts and then cannot find its own server.
Copy-Item (Join-Path $standalone '*') $webOut -Recurse -Force

$serverJs = Get-ChildItem -Path $standalone -Filter server.js -Recurse -File |
            Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
            Select-Object -First 1
if (-not $serverJs) { throw 'server.js not found in the standalone output' }

$relative = $serverJs.FullName.Substring($standalone.Length).TrimStart('\')
if ($relative -ne 'server.js') {
    $target = './' + $relative.Replace('\', '/')
    $launcher = @"
// Generated by build-kit.ps1 -- do not edit.
// Next's standalone output nests the real server under a mirror of the build
// machine's source path, which is only known at build time. This launcher gives
// start.ps1 one stable path to run.
require('$target');
"@
    Set-Content -Path (Join-Path $webOut 'server.js') -Value $launcher -Encoding ascii
    Ok "entry point: $relative (launcher written)"
} else {
    Ok 'entry point: server.js'
}

# ---------------------------------------------------------------- desktop
$seller = Join-Path $here 'payload\app\desktop\warehouse-seller.exe'
if (Test-Path $seller) {
    Say 'Seller shell'
    $deskOut = Join-Path $stage 'app\desktop'
    New-Item -ItemType Directory -Force -Path $deskOut | Out-Null
    Copy-Item $seller (Join-Path $deskOut 'warehouse-seller.exe')
    Ok 'warehouse-seller.exe (from the last Tauri build on this machine)'
}

# ------------------------------------------------------------------ scripts
Say 'Launcher scripts'
$kit = Join-Path $here 'kit'
foreach ($f in @('install.ps1', 'start.ps1', 'stop.ps1', 'install.bat', 'start.bat', 'stop.bat', 'info-template.txt')) {
    $from = Join-Path $kit $f
    if (-not (Test-Path $from)) { throw "Missing kit script: $from" }
    Copy-Item $from $stage
}
$readme = [IO.File]::ReadAllText((Join-Path $kit 'README.txt'), [Text.Encoding]::UTF8)
$readme = $readme.Replace('{{VERSION}}', $version)
[IO.File]::WriteAllText((Join-Path $stage 'README.txt'), $readme, (New-Object Text.UTF8Encoding $false))
Ok 'install/start/stop + README.txt'

# The kit scripts must stay pure ASCII: PowerShell 5.1 parses them with the
# system codepage and one Persian comment on the target laptop is a dead install.
Say 'Checking the scripts are ASCII'
$nonAscii = @(Get-ChildItem $stage -Filter *.ps1 -File |
              Where-Object { (Get-Content $_.FullName -Raw) -match '[^\x00-\x7F]' })
if ($nonAscii.Count -gt 0) {
    foreach ($f in $nonAscii) { Bad "non-ASCII byte(s) in $($f.Name)" }
    throw 'A launcher script contains non-ASCII characters; it would fail to parse on the target laptop.'
}
Ok 'all launcher scripts are ASCII'

# --------------------------------------------------------------- build info
$infoFile = Join-Path $apiOut 'dist\build-info.json'
try {
    $info = Get-Content $infoFile -Raw | ConvertFrom-Json
    $info | Add-Member -NotePropertyName kit -NotePropertyValue "portable-v$version" -Force
    $info | Add-Member -NotePropertyName packagedAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o') -Force
    ($info | ConvertTo-Json) | Set-Content -Path $infoFile -Encoding ascii
} catch {
    Step "could not stamp build-info.json (not fatal): $($_.Exception.Message)"
}

$commit = 'unknown'
Push-Location $repo
try {
    $commit = (git rev-parse --short HEAD 2>$null)
    $dirty = @(git status --porcelain 2>$null).Count
} finally { Pop-Location }
@"
Kardo portable kit
version:  $version
built:    $(Get-Date -Format 'yyyy-MM-dd HH:mm')
commit:   $commit
uncommitted files at build time: $dirty
node:     $nodeVersion
postgres: $pgVer
"@ | Set-Content -Path (Join-Path $stage 'KIT-VERSION.txt') -Encoding ascii

# --------------------------------------------------------------------- zip
$bytes = (Get-ChildItem $stage -Recurse -File | Measure-Object -Property Length -Sum).Sum
$mb = '{0:N0} MB' -f ($bytes / 1MB)

if ($NoZip) {
    Say "Ready: $stage  ($mb)"
    exit 0
}

Say 'Zipping'
if (Test-Path $zip) { Remove-Item $zip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
# includeBaseDirectory = $true: extracting the zip yields the kardo-kit-vX
# folder itself, not its contents sprayed into Downloads.
[IO.Compression.ZipFile]::CreateFromDirectory(
    $stage, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
$zipMb = '{0:N0} MB' -f ((Get-Item $zip).Length / 1MB)

Write-Host ''
Write-Host '=======================================================' -ForegroundColor Green
Write-Host "  Kit v$version ready" -ForegroundColor Green
Write-Host '=======================================================' -ForegroundColor Green
Write-Host "  folder: $stage  ($mb)"
Write-Host "  zip:    $zip  ($zipMb)"
Write-Host ''
Write-Host '  On the other laptop: copy the zip, extract it anywhere but'
Write-Host '  Program Files, then double-click install.bat (do NOT run it as'
Write-Host '  administrator -- PostgreSQL refuses to start elevated).'
